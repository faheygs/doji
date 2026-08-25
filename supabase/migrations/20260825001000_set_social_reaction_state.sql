-- High-frequency social controls describe their desired final state.  A
-- toggle command is ambiguous after a timeout, retry, double tap, or a second
-- device.  Keep the legacy toggle RPCs for installed clients, while new
-- clients use these serialized/idempotent set-state contracts.

create or replace function public.set_post_reaction(
  p_post_id uuid,
  p_emoji text,
  p_active boolean,
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
  current_emoji text;
  total integer;
  breakdown jsonb;
  prior_result jsonb;
  final_result jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if coalesce(length(p_idempotency_key), 0) < 16 then
    raise exception 'Invalid idempotency key';
  end if;
  if p_active is null then raise exception 'Reaction state is required'; end if;
  if p_emoji not in ('fire', 'like', 'dislike', 'laugh', 'wow', 'heart') then
    raise exception 'Invalid reaction';
  end if;
  if not public.can_view_full_post(p_post_id, uid) then
    raise exception 'Post is not available';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_post_id::text || ':' || uid::text, 0)
  );
  select receipt.result into prior_result
  from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return prior_result; end if;

  select reaction.id, reaction.emoji into existing_id, existing_emoji
  from public.reactions reaction
  where reaction.post_id = p_post_id and reaction.user_id = uid
  limit 1;

  if p_active then
    if existing_id is null then
      insert into public.reactions (post_id, user_id, emoji)
      values (p_post_id, uid, p_emoji);
    elsif existing_emoji is distinct from p_emoji then
      update public.reactions set emoji = p_emoji where id = existing_id;
    end if;
  elsif existing_id is not null and existing_emoji = p_emoji then
    delete from public.reactions where id = existing_id;
  end if;

  select reaction.emoji into current_emoji
  from public.reactions reaction
  where reaction.post_id = p_post_id and reaction.user_id = uid
  limit 1;

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
    'post_id', p_post_id,
    'emoji', p_emoji,
    'active', current_emoji = p_emoji,
    'current_emoji', current_emoji,
    'count', total,
    'reaction_breakdown', breakdown
  );
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, final_result);
  return final_result;
end;
$$;

create or replace function public.set_comment_like(
  p_comment_id uuid,
  p_active boolean,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  post_id uuid;
  total integer;
  prior_result jsonb;
  final_result jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if coalesce(length(p_idempotency_key), 0) < 16 then
    raise exception 'Invalid idempotency key';
  end if;
  if p_active is null then raise exception 'Like state is required'; end if;

  select comment.post_id into post_id
  from public.comments comment where comment.id = p_comment_id;
  if post_id is null or not public.can_view_full_post(post_id, uid) then
    raise exception 'Comment is not available';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_comment_id::text || ':' || uid::text, 0)
  );
  select receipt.result into prior_result
  from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return prior_result; end if;

  if p_active then
    insert into public.comment_likes (comment_id, user_id)
    values (p_comment_id, uid)
    on conflict (comment_id, user_id) do nothing;
  else
    delete from public.comment_likes
    where comment_id = p_comment_id and user_id = uid;
  end if;

  select coalesce(comment.like_count, 0) into total
  from public.comments comment where comment.id = p_comment_id;
  final_result := jsonb_build_object(
    'comment_id', p_comment_id,
    'active', exists(
      select 1 from public.comment_likes
      where comment_id = p_comment_id and user_id = uid
    ),
    'count', coalesce(total, 0)
  );
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, final_result);
  return final_result;
end;
$$;

create or replace function public.set_poll_vote_like(
  p_poll_vote_id uuid,
  p_active boolean,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  post_id uuid;
  total integer;
  prior_result jsonb;
  final_result jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if coalesce(length(p_idempotency_key), 0) < 16 then
    raise exception 'Invalid idempotency key';
  end if;
  if p_active is null then raise exception 'Like state is required'; end if;

  select post.id into post_id
  from public.poll_votes vote
  join public.posts post
    on post.daily_event_id = vote.daily_event_id
   and post.is_community_poll is true
  where vote.id = p_poll_vote_id
  limit 1;
  if post_id is null or not public.can_view_full_post(post_id, uid) then
    raise exception 'Poll vote is not available';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_poll_vote_id::text || ':' || uid::text, 0)
  );
  select receipt.result into prior_result
  from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return prior_result; end if;

  if p_active then
    insert into public.poll_vote_likes (poll_vote_id, user_id)
    values (p_poll_vote_id, uid)
    on conflict (user_id, poll_vote_id) do nothing;
  else
    delete from public.poll_vote_likes
    where poll_vote_id = p_poll_vote_id and user_id = uid;
  end if;

  select count(*)::integer into total
  from public.poll_vote_likes where poll_vote_id = p_poll_vote_id;
  final_result := jsonb_build_object(
    'poll_vote_id', p_poll_vote_id,
    'active', exists(
      select 1 from public.poll_vote_likes
      where poll_vote_id = p_poll_vote_id and user_id = uid
    ),
    'count', total
  );
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, final_result);
  return final_result;
end;
$$;

revoke all on function public.set_post_reaction(uuid, text, boolean, text)
  from public, anon;
revoke all on function public.set_comment_like(uuid, boolean, text)
  from public, anon;
revoke all on function public.set_poll_vote_like(uuid, boolean, text)
  from public, anon;
grant execute on function public.set_post_reaction(uuid, text, boolean, text)
  to authenticated;
grant execute on function public.set_comment_like(uuid, boolean, text)
  to authenticated;
grant execute on function public.set_poll_vote_like(uuid, boolean, text)
  to authenticated;
