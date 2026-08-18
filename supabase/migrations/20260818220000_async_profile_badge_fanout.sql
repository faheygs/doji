-- Profile presentation, stats, and badge progress are public to the owner's
-- bounded friend graph, but they must not expand that graph in the triggering
-- transaction. Route identifier-only invalidations through the async batch relay.

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
declare queued_id uuid;
begin
  if p_event_type not in (
    'fanout.post_membership',
    'fanout.friend_completion',
    'fanout.community_reaction',
    'fanout.community_comment',
    'fanout.profile_presentation',
    'fanout.profile_stats',
    'fanout.badge'
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
  on conflict (idempotency_key) do update set payload = excluded.payload
  returning id into queued_id;
  return queued_id;
end;
$$;

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
  elsif queued.event_type in ('fanout.profile_presentation', 'fanout.profile_stats') then
    return query
      select distinct 'user:' || friend.user_id::text || ':events'
      from public.accepted_friend_ids(actor_id) friend
      where not public.users_are_blocked(actor_id, friend.user_id);
  elsif queued.event_type = 'fanout.badge' then
    return query
      select 'user:' || actor_id::text || ':events'
      union
      select 'user:' || friend.user_id::text || ':events'
      from public.accepted_friend_ids(actor_id) friend
      where not public.users_are_blocked(actor_id, friend.user_id);
  end if;
end;
$$;

create or replace function public.publish_public_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  presentation_changed boolean := false;
  stats_changed boolean := false;
  fanout_type text;
begin
  if tg_table_name = 'profiles' then
    uid := case when tg_op = 'DELETE' then old.id else new.id end;
    presentation_changed := old.username is distinct from new.username
      or old.display_name is distinct from new.display_name
      or old.avatar_url is distinct from new.avatar_url
      or old.avatar_gradient is distinct from new.avatar_gradient
      or old.bio is distinct from new.bio
      or old.equipped_border_key is distinct from new.equipped_border_key
      or old.equipped_title_key is distinct from new.equipped_title_key
      or old.accent_theme is distinct from new.accent_theme;
    stats_changed := old.current_streak is distinct from new.current_streak
      or old.longest_streak is distinct from new.longest_streak
      or old.total_completions is distinct from new.total_completions
      or old.total_missed is distinct from new.total_missed
      or old.xp is distinct from new.xp
      or old.level is distinct from new.level
      or old.reactions_received is distinct from new.reactions_received
      or old.reactions_given is distinct from new.reactions_given
      or old.is_admin is distinct from new.is_admin
      or old.is_banned is distinct from new.is_banned;
  elsif tg_table_name = 'weekly_xp' then
    uid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  else
    raise exception 'Unsupported table % for publish_public_profile_change', tg_table_name;
  end if;

  if presentation_changed or stats_changed then
    fanout_type := case when presentation_changed
      then 'fanout.profile_presentation' else 'fanout.profile_stats' end;
    perform public.enqueue_friend_fanout(
      fanout_type, uid,
      jsonb_build_object(
        'actorUserId', uid, 'aggregateId', uid, 'realtimeOnly', true,
        'occurredAt', clock_timestamp()
      ),
      'fanout:profile:' || uid::text || ':' || gen_random_uuid()::text
    );
  end if;

  if tg_table_name = 'weekly_xp' or stats_changed then
    perform public.enqueue_domain_event(
      'leaderboard:global', 'leaderboard.updated', uid,
      jsonb_build_object('version', 1), null
    );
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create or replace function public.publish_public_badge_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
begin
  perform public.enqueue_friend_fanout(
    'fanout.badge', uid,
    jsonb_build_object(
      'actorUserId', uid, 'aggregateId', uid, 'realtimeOnly', true,
      'occurredAt', clock_timestamp()
    ),
    'fanout:badge:' || uid::text || ':' || gen_random_uuid()::text
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.enqueue_friend_fanout(text, uuid, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.get_friend_fanout_realtime_topics(uuid)
  from public, anon, authenticated;
revoke all on function public.publish_public_profile_change()
  from public, anon, authenticated;
revoke all on function public.publish_public_badge_change()
  from public, anon, authenticated;
grant execute on function public.get_friend_fanout_realtime_topics(uuid) to service_role;

comment on function public.publish_public_profile_change() is
  'Publishes bounded profile/leaderboard identifiers without synchronous friend expansion.';
comment on function public.publish_public_badge_change() is
  'Publishes bounded badge identifiers without synchronous friend expansion.';
