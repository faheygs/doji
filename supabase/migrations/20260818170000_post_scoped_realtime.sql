-- Coalesced rows must stay pending until their time bucket closes. Publishing
-- an immediately available row and then overwriting it on conflict can lose
-- the trailing change after the relay has already acknowledged the row.
create or replace function public.enqueue_domain_event(
  p_topic text,
  p_event_type text,
  p_aggregate_id uuid,
  p_payload jsonb,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_id uuid;
  effective_key text := p_idempotency_key;
  epoch_second bigint := floor(extract(epoch from clock_timestamp()))::bigint;
  effective_available_at timestamptz := clock_timestamp();
begin
  if p_topic = 'doji:global' and p_event_type like 'poll.vote.%' then
    effective_key := 'coalesce:poll:' || coalesce(p_payload ->> 'dailyEventId', 'unknown')
      || ':' || epoch_second::text;
  elsif p_topic = 'profiles:global' then
    effective_key := 'coalesce:profiles:' || p_event_type || ':' || epoch_second::text;
  elsif p_topic = 'leaderboard:global' then
    effective_key := 'coalesce:leaderboard:' || (epoch_second / 5)::text;
    effective_available_at := to_timestamp(((epoch_second / 5) + 1) * 5);
  end if;

  if effective_key like 'coalesce:post:%'
     or effective_key like 'coalesce:feed-posts:%'
     or effective_key like 'coalesce:poll:%'
     or effective_key like 'coalesce:profiles:%' then
    effective_available_at := date_trunc('second', clock_timestamp()) + interval '1 second';
  end if;

  insert into public.domain_event_outbox (
    topic, event_type, aggregate_id, payload, idempotency_key, available_at
  ) values (
    p_topic, p_event_type, p_aggregate_id, coalesce(p_payload, '{}'::jsonb),
    effective_key, effective_available_at
  )
  on conflict (idempotency_key) where idempotency_key is not null
  do update set
    topic = excluded.topic,
    event_type = excluded.event_type,
    aggregate_id = excluded.aggregate_id,
    payload = excluded.payload
  returning id into created_id;
  return created_id;
end;
$$;

revoke all on function public.enqueue_domain_event(text, text, uuid, jsonb, text)
  from public, anon, authenticated;

-- Public engagement cannot be broadcast to every connected handset. Feed
-- membership changes use one coalesced signal, while mounted cards/threads
-- subscribe to their UUID-scoped post channel. Friend feeds receive post-row
-- membership changes through the author's bounded social graph.
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
  event_name text;
  payload jsonb;
  epoch_second bigint := floor(extract(epoch from clock_timestamp()))::bigint;
begin
  if tg_table_name = 'comments'
     and tg_op = 'UPDATE'
     and current_setting('doji.comment_counter_only', true) = '1' then
    return new;
  end if;

  event_name := case tg_table_name
    when 'posts' then 'feed.post.' || lower(tg_op)
    when 'reactions' then 'feed.reaction.' || lower(tg_op)
    when 'comments' then 'feed.comment.' || lower(tg_op)
    when 'comment_likes' then 'feed.comment_like.' || lower(tg_op)
    else 'feed.updated'
  end;

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
    'version', 1,
    'postId', post_id,
    'entityId', row_id,
    'dailyEventId', daily_event_id,
    'communityPoll', community
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
      insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
      select distinct recipient.topic, event_name, row_id, payload
      from (
        select 'user:' || owner_id::text || ':events' topic
        union all
        select 'user:' || (case when friendship.requester_id = owner_id
          then friendship.addressee_id else friendship.requester_id end)::text || ':events'
        from public.friendships friendship
        where friendship.status = 'accepted'
          and (friendship.requester_id = owner_id or friendship.addressee_id = owner_id)
      ) recipient;
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

comment on function public.publish_core_social_change() is
  'Routes feed membership through bounded public/friend signals and engagement through mounted-card post channels.';

create or replace function public.publish_poll_vote_like_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  vote_id uuid := case when tg_op = 'DELETE' then old.poll_vote_id else new.poll_vote_id end;
  community_post_id uuid;
  epoch_second bigint := floor(extract(epoch from clock_timestamp()))::bigint;
begin
  select post.id into community_post_id
  from public.poll_votes vote
  join public.user_events occurrence on occurrence.id = vote.user_event_id
  join public.posts post on post.daily_event_id = occurrence.daily_event_id
    and post.is_community_poll = true
  where vote.id = vote_id
  limit 1;

  if community_post_id is not null then
    perform public.enqueue_domain_event(
      'post:' || community_post_id::text,
      'poll.vote_like.' || lower(tg_op),
      vote_id,
      jsonb_build_object(
        'version', 1, 'pollVoteId', vote_id, 'postId', community_post_id
      ),
      'coalesce:post:poll-vote-like:' || community_post_id::text || ':' || epoch_second::text
    );
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.publish_poll_vote_like_change()
  from public, anon, authenticated;
