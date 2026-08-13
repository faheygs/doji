-- Friend participation is visible in-app immediately, while OS pushes are
-- grouped into a durable 30-second bucket delivered 30-60 seconds later.

create or replace function public.notification_group_bucket(p_at timestamptz)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select date_bin(interval '30 seconds', p_at, timestamptz '2000-01-01 00:00:00+00');
$$;

create or replace function public.increment_grouped_notification_payload(
  p_payload jsonb,
  p_action text
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  next_count integer := coalesce((p_payload ->> 'count')::integer, 1) + 1;
  first_actor text := coalesce(nullif(p_payload ->> 'firstActor', ''), 'A friend');
begin
  return p_payload || jsonb_build_object(
    'count', next_count,
    'body', first_actor || ' and ' || (next_count - 1)::text || ' other ' ||
      case when next_count = 2 then 'friend ' else 'friends ' end || p_action
  );
end;
$$;

create or replace function public.trg_user_event_completion_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_name text;
  bucket_at timestamptz := public.notification_group_bucket(clock_timestamp());
begin
  if old.status in ('completed', 'late')
     or new.status not in ('completed', 'late') then
    return new;
  end if;

  if not exists (
    select 1 from public.poll_votes vote where vote.user_event_id = new.id
  ) and not exists (
    select 1 from public.posts post
    where post.user_event_id = new.id and coalesce(post.is_community_poll, false) is false
  ) then
    raise exception 'Cannot complete Doji occurrence without a durable response';
  end if;

  select coalesce(nullif(trim(profile.display_name), ''),
                  nullif(trim(profile.username), ''), 'A friend')
    into actor_name
  from public.profiles profile
  where profile.id = new.user_id;

  -- Immediate private event: refreshes the bell/feed without creating an OS alert.
  insert into public.domain_event_outbox (
    topic, event_type, aggregate_id, payload, idempotency_key
  )
  select
    'user:' || recipient.user_id::text || ':events',
    'notification.friend_activity.updated',
    new.id,
    jsonb_build_object(
      'version', 1, 'sendPush', false, 'targetUserId', recipient.user_id,
      'dailyEventId', new.daily_event_id, 'userEventId', new.id
    ),
    'activity:friend-completion:' || new.id::text || ':' || recipient.user_id::text
  from (
    select distinct case when friendship.requester_id = new.user_id
      then friendship.addressee_id else friendship.requester_id end as user_id
    from public.friendships friendship
    where friendship.status = 'accepted'
      and (friendship.requester_id = new.user_id or friendship.addressee_id = new.user_id)
  ) recipient
  where recipient.user_id <> new.user_id
    and public.can_access_daily_event(new.daily_event_id, recipient.user_id)
  on conflict (idempotency_key) do nothing;

  -- One push row per recipient/Doji/bucket. Later friends atomically update it.
  insert into public.domain_event_outbox (
    topic, event_type, aggregate_id, payload, idempotency_key, available_at
  )
  select
    'user:' || recipient.user_id::text || ':events',
    'notification.friend_activity.grouped',
    new.daily_event_id,
    jsonb_build_object(
      'version', 1, 'sendPush', true, 'targetUserId', recipient.user_id,
      'preferenceKey', 'friend_post', 'title', 'Friends completed today''s Doji',
      'body', coalesce(actor_name, 'A friend') || ' completed today''s Doji',
      'firstActor', coalesce(actor_name, 'A friend'), 'count', 1,
      'type', 'FRIEND_POST', 'dailyEventId', new.daily_event_id, 'url', '/',
      'priority', 'normal', 'interruptionLevel', 'active',
      'threadId', 'doji-participation:' || new.daily_event_id::text,
      'collapseId', 'doji-participation:' || new.daily_event_id::text,
      'tag', 'doji-participation:' || new.daily_event_id::text
    ),
    'push:friend-completion-group:' || new.daily_event_id::text || ':' ||
      recipient.user_id::text || ':' || extract(epoch from bucket_at)::bigint::text,
    bucket_at + interval '60 seconds'
  from (
    select distinct case when friendship.requester_id = new.user_id
      then friendship.addressee_id else friendship.requester_id end as user_id
    from public.friendships friendship
    where friendship.status = 'accepted'
      and (friendship.requester_id = new.user_id or friendship.addressee_id = new.user_id)
  ) recipient
  where recipient.user_id <> new.user_id
    and public.can_access_daily_event(new.daily_event_id, recipient.user_id)
  on conflict (idempotency_key) do update
  set payload = public.increment_grouped_notification_payload(
    public.domain_event_outbox.payload, 'completed today''s Doji'
  );

  return new;
end;
$$;

revoke all on function public.notification_group_bucket(timestamptz)
  from public, anon, authenticated;
revoke all on function public.increment_grouped_notification_payload(jsonb, text)
  from public, anon, authenticated;
revoke all on function public.trg_user_event_completion_push()
  from public, anon, authenticated;

drop trigger if exists user_event_completion_push on public.user_events;
create trigger user_event_completion_push
after update of status on public.user_events
for each row execute function public.trg_user_event_completion_push();
