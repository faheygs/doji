-- Engagement events are identifier-only hints consumed by the mobile client's
-- canonical `feed.*` resolver. Keep counter-only post updates off the global
-- feed channel; mounted cards already subscribe to their bounded post channel.

create or replace function public.publish_core_social_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
  post_id uuid;
  owner_id uuid;
  visibility text;
  community boolean := false;
  daily_event_id uuid;
  event_name text := case
    when tg_table_name = 'posts' then 'feed.post.' || lower(tg_op)
    when tg_table_name = 'reactions' then 'feed.reaction.' || lower(tg_op)
    when tg_table_name = 'comments' then 'feed.comment.' || lower(tg_op)
    else 'feed.comment_like.' || lower(tg_op)
  end;
  payload jsonb;
  epoch_second bigint := floor(extract(epoch from clock_timestamp()))::bigint;
begin
  if tg_table_name = 'comments'
     and tg_op = 'UPDATE'
     and current_setting('doji.comment_counter_only', true) = '1' then
    return new;
  end if;

  -- reaction_count/comment_count are maintained denormalized counters. Their
  -- nested UPDATE must not masquerade as feed membership/content activity.
  if tg_table_name = 'posts' and tg_op = 'UPDATE'
     and (to_jsonb(new) - 'reaction_count' - 'comment_count' - 'updated_at')
       = (to_jsonb(old) - 'reaction_count' - 'comment_count' - 'updated_at') then
    return new;
  end if;

  if tg_table_name = 'posts' then
    post_id := row_id;
    owner_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
    visibility := case when tg_op = 'DELETE' then old.visibility else new.visibility end;
    community := coalesce(case when tg_op = 'DELETE'
      then old.is_community_poll else new.is_community_poll end, false);
    daily_event_id := case when tg_op = 'DELETE'
      then old.daily_event_id else new.daily_event_id end;
  elsif tg_table_name = 'reactions' then
    post_id := case when tg_op = 'DELETE' then old.post_id else new.post_id end;
  elsif tg_table_name = 'comments' then
    post_id := case when tg_op = 'DELETE' then old.post_id else new.post_id end;
  else
    select comment.post_id into post_id
    from public.comments comment
    where comment.id = case when tg_op = 'DELETE' then old.comment_id else new.comment_id end;
  end if;

  if tg_table_name <> 'posts' and post_id is not null then
    select post.user_id, post.visibility, coalesce(post.is_community_poll, false),
           post.daily_event_id
      into owner_id, visibility, community, daily_event_id
    from public.posts post where post.id = post_id;
  end if;
  if post_id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  payload := jsonb_build_object(
    'version', 1, 'postId', post_id, 'entityId', row_id,
    'dailyEventId', daily_event_id, 'communityPoll', community
  );

  if tg_table_name = 'posts' then
    if community or visibility = 'public' then
      perform public.enqueue_domain_event(
        'feed:public', event_name, row_id, payload,
        'coalesce:feed-posts:' || event_name || ':' ||
          coalesce(daily_event_id::text, 'none') || ':' || epoch_second::text
      );
    end if;
    if owner_id is not null then
      perform public.enqueue_domain_event(
        'user:' || owner_id::text || ':events', event_name, row_id, payload,
        'post-owner:' || event_name || ':' || row_id::text
      );
      if tg_op = 'INSERT' then
        perform public.enqueue_friend_fanout(
          'fanout.post_membership', row_id,
          jsonb_build_object(
            'actorUserId', owner_id, 'aggregateId', row_id,
            'dailyEventId', daily_event_id, 'communityPoll', community,
            'occurredAt', clock_timestamp()
          ),
          'fanout-request:post-membership:' || row_id::text
        );
      end if;
    end if;
  else
    perform public.enqueue_domain_event(
      'post:' || post_id::text, event_name, row_id, payload,
      'coalesce:post:' || event_name || ':' || post_id::text || ':' || epoch_second::text
    );
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.publish_core_social_change()
  from public, anon, authenticated;

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

  select coalesce(sum(grouped.reaction_count), 0)::integer,
         coalesce(jsonb_object_agg(grouped.emoji, grouped.reaction_count), '{}'::jsonb)
    into total, breakdown
  from (
    select reaction.emoji, count(*)::integer reaction_count
    from public.reactions reaction
    where reaction.post_id = p_post_id
    group by reaction.emoji
  ) grouped;

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

comment on function public.publish_core_social_change() is
  'Publishes canonical identifier-only feed events; counter-only post updates remain post-scoped.';

create or replace function public.get_post_engagement_snapshot(p_post_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with grouped as (
    select reaction.emoji, count(*)::integer reaction_count
    from public.reactions reaction
    where reaction.post_id = p_post_id
    group by reaction.emoji
  ), mine as (
    select jsonb_agg(reaction.emoji order by reaction.created_at) emojis
    from public.reactions reaction
    where reaction.post_id = p_post_id and reaction.user_id = auth.uid()
  )
  select jsonb_build_object(
    'post_id', post.id,
    'reaction_count', post.reaction_count,
    'comment_count', post.comment_count,
    'reaction_breakdown', coalesce(
      (select jsonb_object_agg(grouped.emoji, grouped.reaction_count) from grouped),
      '{}'::jsonb
    ),
    'my_reactions', coalesce((select mine.emojis from mine), '[]'::jsonb)
  )
  from public.posts post
  where post.id = p_post_id;
$$;

revoke all on function public.get_post_engagement_snapshot(uuid)
  from public, anon;
grant execute on function public.get_post_engagement_snapshot(uuid)
  to authenticated;
