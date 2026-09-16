-- Keep bursty user-visible realtime work ahead of internal graph expansion and
-- remove one database round trip per no-push event from the relay hot path.

create or replace function public.complete_domain_events_batch(p_events jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  with requested as (
    select (item ->> 'id')::uuid as id,
           (item ->> 'leaseId')::uuid as lease_id
    from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) item
  )
  update public.domain_event_outbox event
  set published_at = clock_timestamp(),
      lease_id = null,
      leased_at = null
  from requested
  where event.id = requested.id
    and event.lease_id = requested.lease_id
    and event.published_at is null;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create or replace function public.release_domain_events_batch(
  p_events jsonb,
  p_error text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  with requested as (
    select (item ->> 'id')::uuid as id,
           (item ->> 'leaseId')::uuid as lease_id
    from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) item
  )
  update public.domain_event_outbox event
  set lease_id = null,
      leased_at = null,
      last_error = left(p_error, 1000)
  from requested
  where event.id = requested.id
    and event.lease_id = requested.lease_id
    and event.published_at is null;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.complete_domain_events_batch(jsonb)
  from public, anon, authenticated;
revoke all on function public.release_domain_events_batch(jsonb, text)
  from public, anon, authenticated;
grant execute on function public.complete_domain_events_batch(jsonb) to service_role;
grant execute on function public.release_domain_events_batch(jsonb, text) to service_role;

drop index if exists public.domain_event_outbox_delivery_priority_idx;
create index domain_event_outbox_delivery_priority_idx
  on public.domain_event_outbox (
    (case
      when event_type = 'doji.activated' then 0
      when topic <> 'internal:friend-fanout'
        and coalesce((payload ->> 'sendPush')::boolean, false) is false
        and coalesce((payload ->> 'broadcastPush')::boolean, false) is false then 1
      when topic <> 'internal:friend-fanout' then 2
      else 3
    end),
    available_at,
    created_at
  )
  where published_at is null;

create or replace function public.claim_domain_events_v2(p_batch_size integer default 100)
returns table (
  id uuid,
  topic text,
  event_type text,
  aggregate_id uuid,
  payload jsonb,
  attempts integer,
  lease_id uuid,
  created_at timestamptz,
  available_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_lease uuid := gen_random_uuid();
begin
  if p_batch_size < 1 or p_batch_size > 500 then
    raise exception 'batch size must be between 1 and 500';
  end if;

  return query
  with claimable as (
    select event.id
    from public.domain_event_outbox event
    where event.published_at is null
      and event.available_at <= clock_timestamp()
      and (event.leased_at is null
        or event.leased_at < clock_timestamp() - interval '2 minutes')
    order by case
        when event.event_type = 'doji.activated' then 0
        when event.topic <> 'internal:friend-fanout'
          and coalesce((event.payload ->> 'sendPush')::boolean, false) is false
          and coalesce((event.payload ->> 'broadcastPush')::boolean, false) is false then 1
        when event.topic <> 'internal:friend-fanout' then 2
        else 3
      end,
      event.available_at, event.created_at, event.id
    for update skip locked
    limit p_batch_size
  ), claimed as (
    update public.domain_event_outbox event
    set lease_id = next_lease,
        leased_at = clock_timestamp(),
        attempts = event.attempts + 1,
        last_error = null
    from claimable
    where event.id = claimable.id
    returning event.id, event.topic, event.event_type, event.aggregate_id,
              event.payload, event.attempts, event.lease_id,
              event.created_at, event.available_at,
              case
                when event.event_type = 'doji.activated' then 0
                when event.topic <> 'internal:friend-fanout'
                  and coalesce((event.payload ->> 'sendPush')::boolean, false) is false
                  and coalesce((event.payload ->> 'broadcastPush')::boolean, false) is false then 1
                when event.topic <> 'internal:friend-fanout' then 2
                else 3
              end as delivery_priority
  )
  select claimed.id, claimed.topic, claimed.event_type, claimed.aggregate_id,
         claimed.payload, claimed.attempts, claimed.lease_id,
         claimed.created_at, claimed.available_at
  from claimed
  order by claimed.delivery_priority, claimed.available_at, claimed.created_at, claimed.id;
end;
$$;

revoke all on function public.claim_domain_events_v2(integer)
  from public, anon, authenticated;
grant execute on function public.claim_domain_events_v2(integer) to service_role;

-- Coalesce repeated profile writes only inside the same database transaction.
-- txid_current() cannot merge separate user actions, so no invalidation can be
-- lost after an outbox row has already been published.
create or replace function public.publish_private_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.enqueue_domain_event(
    'user:' || new.id::text || ':events',
    'account.profile.updated',
    new.id,
    jsonb_build_object('version', 1, 'userId', new.id),
    'account-profile:' || new.id::text || ':' || txid_current()::text
  );
  return new;
end;
$$;

revoke all on function public.publish_private_profile_change()
  from public, anon, authenticated;

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
  leaderboard_changed boolean := false;
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
    leaderboard_changed := presentation_changed
      or old.xp is distinct from new.xp
      or old.level is distinct from new.level
      or old.is_banned is distinct from new.is_banned;
  elsif tg_table_name = 'weekly_xp' then
    uid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
    leaderboard_changed := true;
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
      'fanout:profile:' || fanout_type || ':' || uid::text || ':' || txid_current()::text
    );
  end if;

  if leaderboard_changed then
    perform public.enqueue_domain_event(
      'leaderboard:global', 'leaderboard.updated', uid,
      jsonb_build_object('version', 1), null
    );
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.publish_public_profile_change()
  from public, anon, authenticated;

comment on function public.publish_public_profile_change() is
  'Fans profile changes to friends and emits leaderboard invalidation only for rendered/ranking fields; repeat writes coalesce within one transaction.';
