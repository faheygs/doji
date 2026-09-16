-- Community reaction fanout is durable secondary work. Expanding a viewer's
-- friend graph in the interactive reaction transaction made tap latency grow
-- with audience size and regressed the async contract introduced in
-- 20260818210000. Keep the private-post owner path constant-sized, and queue a
-- single idempotent command for community fanout after commit.

create or replace function public.trg_reaction_push_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  is_community boolean;
  event_id uuid;
  actor_name text;
  bucket_at timestamptz := public.notification_group_bucket(clock_timestamp());
  first_key text;
begin
  select post.user_id, coalesce(post.is_community_poll, false), post.daily_event_id
    into owner_id, is_community, event_id
  from public.posts post
  where post.id = new.post_id;

  select coalesce(nullif(trim(profile.display_name), ''), profile.username, 'Someone')
    into actor_name
  from public.profiles profile
  where profile.id = new.user_id;

  if is_community then
    perform public.enqueue_friend_fanout(
      'fanout.community_reaction',
      new.post_id,
      jsonb_build_object(
        'actorUserId', new.user_id,
        'actorName', actor_name,
        'aggregateId', new.post_id,
        'dailyEventId', event_id,
        'occurredAt', coalesce(new.created_at, clock_timestamp())
      ),
      'fanout-request:community-reaction:' || new.post_id::text || ':' || new.user_id::text
    );
    return new;
  end if;

  if owner_id is null or owner_id = new.user_id then
    return new;
  end if;

  -- The bell refresh remains immediate and independent from the grouped push.
  perform public.enqueue_domain_event(
    'user:' || owner_id::text || ':events',
    'notification.reaction.updated',
    new.post_id,
    jsonb_build_object(
      'version', 1,
      'sendPush', false,
      'targetUserId', owner_id,
      'postId', new.post_id,
      'dailyEventId', event_id
    ),
    'activity:reaction:first:' || new.post_id::text || ':' || new.user_id::text || ':' ||
      owner_id::text
  );

  first_key := 'reaction:first:' || new.post_id::text || ':' || new.user_id::text || ':' ||
    owner_id::text;
  insert into public.notification_once_keys (delivery_key)
  values (first_key)
  on conflict (delivery_key) do nothing;
  if not found then
    return new;
  end if;

  insert into public.domain_event_outbox (
    topic, event_type, aggregate_id, payload, idempotency_key, available_at
  ) values (
    'user:' || owner_id::text || ':events',
    'notification.reactions.grouped',
    new.post_id,
    jsonb_build_object(
      'version', 1,
      'sendPush', true,
      'targetUserId', owner_id,
      'preferenceKey', 'reactions_on_my_post',
      'title', 'New reactions',
      'body', coalesce(actor_name, 'Someone') || ' reacted to your post',
      'firstActor', coalesce(actor_name, 'Someone'),
      'count', 1,
      'type', 'REACTION',
      'postId', new.post_id,
      'dailyEventId', event_id,
      'url', '/post/' || new.post_id::text,
      'priority', 'normal',
      'interruptionLevel', 'active',
      'threadId', 'post-reactions:' || new.post_id::text,
      'collapseId', 'post-reactions:' || new.post_id::text,
      'tag', 'post-reactions:' || new.post_id::text
    ),
    'push:reaction-group:' || new.post_id::text || ':' || owner_id::text || ':' ||
      extract(epoch from bucket_at)::bigint::text,
    bucket_at + interval '60 seconds'
  )
  on conflict (idempotency_key) do update
  set payload = public.increment_grouped_notification_payload(
    public.domain_event_outbox.payload,
    'reacted to your post'
  );

  return new;
end;
$$;

revoke all on function public.trg_reaction_push_notify() from public, anon, authenticated;

comment on function public.trg_reaction_push_notify() is
  'Keeps reaction writes constant-sized by moving community friend expansion to the durable relay.';
