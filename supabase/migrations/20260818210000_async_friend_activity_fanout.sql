-- Keep user-facing social writes constant-time. Friend-scoped expansion happens
-- after commit through the durable domain-event relay and remains idempotent.

create or replace function public.enqueue_friend_fanout(
  p_event_type text,
  p_aggregate_id uuid,
  p_payload jsonb,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  queued_id uuid;
begin
  if p_event_type not in (
    'fanout.post_membership',
    'fanout.friend_completion',
    'fanout.community_reaction',
    'fanout.community_comment'
  ) then
    raise exception 'Unsupported friend fanout event';
  end if;

  insert into public.domain_event_outbox (
    topic, event_type, aggregate_id, payload, idempotency_key
  ) values (
    'internal:friend-fanout', p_event_type, p_aggregate_id,
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('version', 1),
    p_idempotency_key
  )
  on conflict (idempotency_key) do update
    set payload = excluded.payload
  returning id into queued_id;
  return queued_id;
end;
$$;

create or replace function public.accepted_friend_ids(p_user_id uuid)
returns table(user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select case when friendship.requester_id = p_user_id
    then friendship.addressee_id else friendship.requester_id end
  from public.friendships friendship
  where friendship.status = 'accepted'
    and (friendship.requester_id = p_user_id or friendship.addressee_id = p_user_id)
  order by friendship.accepted_at desc nulls last, friendship.id
  limit 500;
$$;

create or replace function public.users_are_blocked(p_first uuid, p_second uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks block
    where (block.blocker_id = p_first and block.blocked_id = p_second)
       or (block.blocker_id = p_second and block.blocked_id = p_first)
  ) or exists (
    select 1 from public.friendships friendship
    where friendship.status = 'blocked'
      and ((friendship.requester_id = p_first and friendship.addressee_id = p_second)
        or (friendship.requester_id = p_second and friendship.addressee_id = p_first))
  );
$$;

-- Realtime invalidation is transient delivery with authoritative reconciliation.
-- Return bounded user topics so the relay can use Ably's multi-channel batch API
-- instead of writing one durable database row per friend.
create or replace function public.get_friend_fanout_realtime_topics(p_event_id uuid)
returns table(topic text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  queued public.domain_event_outbox%rowtype;
  actor_id uuid;
  daily_id uuid;
begin
  select * into queued
  from public.domain_event_outbox event
  where event.id = p_event_id and event.topic = 'internal:friend-fanout';
  if queued.id is null then raise exception 'Friend fanout event not found'; end if;

  actor_id := nullif(queued.payload ->> 'actorUserId', '')::uuid;
  daily_id := nullif(queued.payload ->> 'dailyEventId', '')::uuid;
  if actor_id is null then raise exception 'Invalid friend fanout payload'; end if;

  if queued.event_type = 'fanout.post_membership' then
    return query
      select distinct 'user:' || friend.user_id::text || ':events'
      from public.accepted_friend_ids(actor_id) friend
      where not public.users_are_blocked(actor_id, friend.user_id);
  elsif queued.event_type in ('fanout.friend_completion', 'fanout.community_reaction') then
    return query
      select distinct 'user:' || friend.user_id::text || ':events'
      from public.accepted_friend_ids(actor_id) friend
      where public.can_access_daily_event(daily_id, friend.user_id)
        and not public.users_are_blocked(actor_id, friend.user_id);
  end if;
end;
$$;

create or replace function public.process_friend_fanout_event(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  queued public.domain_event_outbox%rowtype;
  actor_id uuid;
  aggregate_id uuid;
  daily_id uuid;
  parent_author_id uuid;
  actor_name text;
  occurred_at timestamptz;
  bucket_at timestamptz;
  affected integer := 0;
  changed integer := 0;
begin
  select * into queued
  from public.domain_event_outbox event
  where event.id = p_event_id and event.topic = 'internal:friend-fanout';
  if queued.id is null then raise exception 'Friend fanout event not found'; end if;

  actor_id := nullif(queued.payload ->> 'actorUserId', '')::uuid;
  aggregate_id := nullif(queued.payload ->> 'aggregateId', '')::uuid;
  daily_id := nullif(queued.payload ->> 'dailyEventId', '')::uuid;
  parent_author_id := nullif(queued.payload ->> 'parentAuthorId', '')::uuid;
  actor_name := coalesce(nullif(queued.payload ->> 'actorName', ''), 'A friend');
  occurred_at := coalesce(
    nullif(queued.payload ->> 'occurredAt', '')::timestamptz,
    queued.created_at
  );
  bucket_at := public.notification_group_bucket(occurred_at);
  if actor_id is null or aggregate_id is null then
    raise exception 'Invalid friend fanout payload';
  end if;

  if queued.event_type = 'fanout.post_membership' then
    null;

  elsif queued.event_type = 'fanout.friend_completion' then
    with eligible as (
      insert into public.notification_once_keys (delivery_key)
      select 'friend-completion:first:' || aggregate_id::text || ':' || friend.user_id::text
      from public.accepted_friend_ids(actor_id) friend
      where public.can_access_daily_event(daily_id, friend.user_id)
        and not public.users_are_blocked(actor_id, friend.user_id)
      on conflict (delivery_key) do nothing
      returning delivery_key
    )
    insert into public.domain_event_outbox (
      topic, event_type, aggregate_id, payload, idempotency_key, available_at
    )
    select
      'user:' || friend.user_id::text || ':events',
      'notification.friend_activity.grouped', daily_id,
      jsonb_build_object(
        'version', 1, 'sendPush', true, 'targetUserId', friend.user_id,
        'preferenceKey', 'friend_post', 'title', 'Friends completed today''s Doji',
        'body', actor_name || ' completed today''s Doji',
        'firstActor', actor_name, 'count', 1, 'type', 'FRIEND_POST',
        'dailyEventId', daily_id, 'occurredAt', occurred_at,
        'url', '/', 'priority', 'normal',
        'interruptionLevel', 'active',
        'threadId', 'doji-participation:' || daily_id::text,
        'collapseId', 'doji-participation:' || daily_id::text,
        'tag', 'doji-participation:' || daily_id::text
      ),
      'push:friend-completion-group:' || daily_id::text || ':' || friend.user_id::text || ':' ||
        extract(epoch from bucket_at)::bigint::text,
      bucket_at + interval '60 seconds'
    from public.accepted_friend_ids(actor_id) friend
    join eligible first_alert on first_alert.delivery_key =
      'friend-completion:first:' || aggregate_id::text || ':' || friend.user_id::text
    on conflict (idempotency_key) do update set payload =
      public.increment_grouped_notification_payload(
        public.domain_event_outbox.payload, 'completed today''s Doji'
      );

  elsif queued.event_type = 'fanout.community_reaction' then
    with eligible as (
      insert into public.notification_once_keys (delivery_key)
      select 'reaction:first:' || aggregate_id::text || ':' || actor_id::text || ':' ||
        friend.user_id::text
      from public.accepted_friend_ids(actor_id) friend
      where public.can_access_daily_event(daily_id, friend.user_id)
        and not public.users_are_blocked(actor_id, friend.user_id)
      on conflict (delivery_key) do nothing
      returning delivery_key
    )
    insert into public.domain_event_outbox (
      topic, event_type, aggregate_id, payload, idempotency_key, available_at
    )
    select
      'user:' || friend.user_id::text || ':events',
      'notification.reactions.grouped', aggregate_id,
      jsonb_build_object(
        'version', 1, 'sendPush', true, 'targetUserId', friend.user_id,
        'preferenceKey', 'reactions_on_my_post', 'title', 'New reactions',
        'body', actor_name || ' reacted to today''s Doji', 'firstActor', actor_name,
        'count', 1, 'type', 'REACTION', 'postId', aggregate_id,
        'dailyEventId', daily_id, 'occurredAt', occurred_at,
        'url', '/', 'priority', 'normal',
        'interruptionLevel', 'active', 'threadId', 'post-reactions:' || aggregate_id::text,
        'collapseId', 'post-reactions:' || aggregate_id::text,
        'tag', 'post-reactions:' || aggregate_id::text
      ),
      'push:reaction-group:' || aggregate_id::text || ':' || friend.user_id::text || ':' ||
        extract(epoch from bucket_at)::bigint::text,
      bucket_at + interval '60 seconds'
    from public.accepted_friend_ids(actor_id) friend
    join eligible first_alert on first_alert.delivery_key =
      'reaction:first:' || aggregate_id::text || ':' || actor_id::text || ':' ||
      friend.user_id::text
    on conflict (idempotency_key) do update set payload =
      public.increment_grouped_notification_payload(
        public.domain_event_outbox.payload, 'reacted to today''s Doji'
      );

  elsif queued.event_type = 'fanout.community_comment' then
    insert into public.domain_event_outbox (
      topic, event_type, aggregate_id, payload, idempotency_key
    )
    select
      'user:' || friend.user_id::text || ':events',
      'notification.comment.created', aggregate_id,
      jsonb_build_object(
        'version', 1, 'sendPush', true, 'targetUserId', friend.user_id,
        'preferenceKey', 'comment', 'title', 'New comment',
        'body', actor_name || ' commented on today''s Doji', 'type', 'COMMENT',
        'postId', nullif(queued.payload ->> 'postId', '')::uuid,
        'dailyEventId', daily_id, 'occurredAt', occurred_at, 'url', '/'
      ),
      'push:comment:' || aggregate_id::text || ':' || friend.user_id::text
    from public.accepted_friend_ids(actor_id) friend
    where friend.user_id is distinct from parent_author_id
      and public.can_access_daily_event(daily_id, friend.user_id)
      and not public.users_are_blocked(actor_id, friend.user_id)
    on conflict (idempotency_key) do nothing;
  else
    raise exception 'Unsupported friend fanout event type';
  end if;

  get diagnostics changed = row_count;
  affected := affected + changed;
  return affected;
end;
$$;

revoke all on function public.enqueue_friend_fanout(text, uuid, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.accepted_friend_ids(uuid)
  from public, anon, authenticated;
revoke all on function public.users_are_blocked(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.get_friend_fanout_realtime_topics(uuid)
  from public, anon, authenticated;
revoke all on function public.process_friend_fanout_event(uuid)
  from public, anon, authenticated;
grant execute on function public.get_friend_fanout_realtime_topics(uuid) to service_role;
grant execute on function public.process_friend_fanout_event(uuid) to service_role;

-- A post write only emits the public membership signal, its owner signal, and
-- one durable expansion command. Engagement continues on the post channel.
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
    when tg_table_name = 'posts' then 'post.' || lower(tg_op)
    when tg_table_name = 'reactions' then 'reaction.' || lower(tg_op)
    when tg_table_name = 'comments' then 'comment.' || lower(tg_op)
    else 'comment_like.' || lower(tg_op)
  end;
  payload jsonb;
  epoch_second bigint := floor(extract(epoch from clock_timestamp()))::bigint;
begin
  -- Comment-like writes maintain comments.likes_count in the same transaction.
  -- That counter-only UPDATE must not publish a second comment event.
  if tg_table_name = 'comments'
     and tg_op = 'UPDATE'
     and current_setting('doji.comment_counter_only', true) = '1' then
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
    select comment.post_id into post_id from public.comments comment
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

create or replace function public.trg_user_event_completion_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare actor_name text;
begin
  if old.status in ('completed', 'late') or new.status not in ('completed', 'late') then
    return new;
  end if;
  if not exists (select 1 from public.poll_votes vote where vote.user_event_id = new.id)
     and not exists (
       select 1 from public.posts post where post.user_event_id = new.id
         and coalesce(post.is_community_poll, false) is false
     ) then
    raise exception 'Cannot complete Doji occurrence without a durable response';
  end if;
  select coalesce(nullif(trim(profile.display_name), ''),
                  nullif(trim(profile.username), ''), 'A friend')
    into actor_name from public.profiles profile where profile.id = new.user_id;
  perform public.enqueue_friend_fanout(
    'fanout.friend_completion', new.id,
    jsonb_build_object(
      'actorUserId', new.user_id, 'actorName', actor_name,
      'aggregateId', new.id, 'dailyEventId', new.daily_event_id,
      'occurredAt', coalesce(new.completed_at, clock_timestamp())
    ),
    'fanout-request:friend-completion:' || new.id::text
  );
  return new;
end;
$$;

create or replace function public.trg_reaction_push_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid; is_community boolean; event_id uuid; actor_name text;
begin
  select post.user_id, coalesce(post.is_community_poll, false), post.daily_event_id
    into owner_id, is_community, event_id from public.posts post where post.id = new.post_id;
  select coalesce(nullif(trim(profile.display_name), ''), profile.username, 'Someone')
    into actor_name from public.profiles profile where profile.id = new.user_id;
  if is_community then
    perform public.enqueue_friend_fanout(
      'fanout.community_reaction', new.post_id,
      jsonb_build_object(
        'actorUserId', new.user_id, 'actorName', actor_name,
        'aggregateId', new.post_id, 'dailyEventId', event_id,
        'occurredAt', coalesce(new.created_at, clock_timestamp())
      ),
      'fanout-request:community-reaction:' || new.post_id::text || ':' || new.user_id::text
    );
  elsif owner_id is not null and owner_id <> new.user_id then
    insert into public.domain_event_outbox (
      topic, event_type, aggregate_id, payload, idempotency_key
    ) values (
      'user:' || owner_id::text || ':events', 'notification.reaction.updated', new.post_id,
      jsonb_build_object(
        'version', 1, 'sendPush', true, 'targetUserId', owner_id,
        'preferenceKey', 'reactions_on_my_post', 'title', 'New reaction',
        'body', actor_name || ' reacted to your post', 'type', 'REACTION',
        'postId', new.post_id, 'url', '/post/' || new.post_id::text
      ),
      'push:reaction:first:' || new.post_id::text || ':' || new.user_id::text || ':' ||
        owner_id::text
    ) on conflict (idempotency_key) do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.trg_comment_push_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid; is_community boolean; comments_disabled boolean;
  daily_id uuid; actor_name text; parent_author_id uuid;
begin
  select post.user_id, coalesce(post.is_community_poll, false),
         coalesce(post.comments_disabled, false), post.daily_event_id
    into owner_id, is_community, comments_disabled, daily_id
  from public.posts post where post.id = new.post_id;
  if comments_disabled then return new; end if;
  select coalesce(nullif(trim(profile.display_name), ''), profile.username, 'Someone')
    into actor_name from public.profiles profile where profile.id = new.user_id;
  if new.parent_id is not null then
    select parent.user_id into parent_author_id
    from public.comments parent where parent.id = new.parent_id;
  end if;

  if is_community then
    perform public.enqueue_friend_fanout(
      'fanout.community_comment', new.id,
      jsonb_build_object(
        'actorUserId', new.user_id, 'actorName', actor_name,
        'aggregateId', new.id, 'postId', new.post_id,
        'dailyEventId', daily_id, 'parentAuthorId', parent_author_id,
        'occurredAt', coalesce(new.created_at, clock_timestamp())
      ),
      'fanout-request:community-comment:' || new.id::text
    );
  elsif owner_id is not null and owner_id <> new.user_id
        and owner_id is distinct from parent_author_id then
    insert into public.domain_event_outbox (
      topic, event_type, aggregate_id, payload, idempotency_key
    ) values (
      'user:' || owner_id::text || ':events', 'notification.comment.created', new.id,
      jsonb_build_object(
        'version', 1, 'sendPush', true, 'targetUserId', owner_id,
        'preferenceKey', 'comment', 'title', 'New comment',
        'body', actor_name || ' commented on your post', 'type', 'COMMENT',
        'postId', new.post_id, 'url', '/post/' || new.post_id::text
      ),
      'push:comment:' || new.id::text || ':' || owner_id::text
    ) on conflict (idempotency_key) do nothing;
  end if;

  if parent_author_id is not null and parent_author_id <> new.user_id then
    insert into public.domain_event_outbox (
      topic, event_type, aggregate_id, payload, idempotency_key
    ) values (
      'user:' || parent_author_id::text || ':events',
      'notification.comment_reply.created', new.id,
      jsonb_build_object(
        'version', 1, 'sendPush', true, 'targetUserId', parent_author_id,
        'preferenceKey', 'comment_reply', 'title', 'New reply',
        'body', actor_name || ' replied to your comment', 'type', 'COMMENT_REPLY',
        'postId', new.post_id, 'commentId', new.id, 'dailyEventId', daily_id,
        'url', case when is_community then '/' else '/post/' || new.post_id::text end
      ),
      'push:comment-reply:' || new.id::text || ':' || parent_author_id::text
    ) on conflict (idempotency_key) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.publish_core_social_change() from public, anon, authenticated;
revoke all on function public.trg_user_event_completion_push() from public, anon, authenticated;
revoke all on function public.trg_reaction_push_notify() from public, anon, authenticated;
revoke all on function public.trg_comment_push_notify() from public, anon, authenticated;

comment on function public.process_friend_fanout_event(uuid) is
  'Expands a committed internal fanout command outside the originating user write; every child event is idempotent.';
