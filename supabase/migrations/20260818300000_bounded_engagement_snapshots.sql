-- Engagement reads and reaction command results must remain bounded for a
-- popular post. The fixed 128-way counter shards are authoritative; never
-- regroup the unbounded reactions table to render a count or breakdown.

create or replace function public.toggle_post_reaction(
  p_post_id uuid,
  p_emoji text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  existing_id uuid;
  existing_emoji text;
  is_active boolean;
  total integer;
  breakdown jsonb;
  prior_result jsonb;
  final_result jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if length(p_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;
  if p_emoji not in ('fire', 'like', 'dislike', 'laugh', 'wow', 'heart') then
    raise exception 'Invalid reaction';
  end if;
  if not public.can_view_full_post(p_post_id, uid) then
    raise exception 'Post is not available';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_post_id::text || ':' || uid::text, 0));
  select receipt.result into prior_result
  from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return prior_result; end if;

  select reaction.id, reaction.emoji into existing_id, existing_emoji
  from public.reactions reaction
  where reaction.post_id = p_post_id and reaction.user_id = uid
  limit 1;

  if existing_id is null then
    insert into public.reactions (post_id, user_id, emoji)
    values (p_post_id, uid, p_emoji);
    is_active := true;
  elsif existing_emoji = p_emoji then
    delete from public.reactions where id = existing_id;
    is_active := false;
  else
    update public.reactions set emoji = p_emoji where id = existing_id;
    is_active := true;
  end if;

  select
    coalesce((
      select sum(shard.reaction_count)::integer
      from public.post_engagement_shards shard
      where shard.post_id = p_post_id
    ), 0),
    coalesce((
      select jsonb_object_agg(grouped.emoji, grouped.reaction_count)
      from (
        select shard.emoji, sum(shard.reaction_count)::integer reaction_count
        from public.post_reaction_count_shards shard
        where shard.post_id = p_post_id and shard.reaction_count > 0
        group by shard.emoji
      ) grouped
    ), '{}'::jsonb)
  into total, breakdown;

  final_result := jsonb_build_object(
    'post_id', p_post_id, 'emoji', p_emoji, 'active', is_active,
    'count', total, 'reaction_breakdown', breakdown
  );
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, final_result);
  return final_result;
end;
$$;

revoke all on function public.toggle_post_reaction(uuid, text, text)
  from public, anon;
grant execute on function public.toggle_post_reaction(uuid, text, text)
  to authenticated;

create or replace function public.get_post_engagement_snapshot(p_post_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  result jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if not public.can_view_full_post(p_post_id, uid) then
    raise exception 'Post is not available';
  end if;

  select jsonb_build_object(
    'post_id', post.id,
    'reaction_count', coalesce(engagement.reaction_count, 0),
    'comment_count', coalesce(engagement.comment_count, 0),
    'reaction_breakdown', coalesce(breakdown.value, '{}'::jsonb),
    'my_reactions', coalesce(mine.value, '[]'::jsonb)
  )
  into result
  from public.posts post
  left join lateral (
    select sum(shard.reaction_count)::integer reaction_count,
           sum(shard.comment_count)::integer comment_count
    from public.post_engagement_shards shard
    where shard.post_id = post.id
  ) engagement on true
  left join lateral (
    select jsonb_object_agg(grouped.emoji, grouped.reaction_count) value
    from (
      select shard.emoji, sum(shard.reaction_count)::integer reaction_count
      from public.post_reaction_count_shards shard
      where shard.post_id = post.id and shard.reaction_count > 0
      group by shard.emoji
    ) grouped
  ) breakdown on true
  left join lateral (
    select jsonb_agg(reaction.emoji order by reaction.created_at) value
    from public.reactions reaction
    where reaction.post_id = post.id and reaction.user_id = uid
  ) mine on true
  where post.id = p_post_id;

  return result;
end;
$$;

revoke all on function public.get_post_engagement_snapshot(uuid)
  from public, anon;
grant execute on function public.get_post_engagement_snapshot(uuid)
  to authenticated;

comment on function public.get_post_engagement_snapshot(uuid) is
  'Authorized bounded engagement snapshot sourced from 128 fixed counter shards.';
