-- Doji-start push work is planned after activation from the actual eligible
-- recipient set. Activation remains constant-time, while a six-user audience
-- creates only the physical partitions it needs and a large audience can still
-- use all 128 indexed partitions.

create or replace function public.activate_daily_event(p_daily_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row record;
  activation_time timestamptz := clock_timestamp();
  close_time timestamptz;
begin
  select event.*, challenge.title into event_row
  from public.daily_events event
  join public.challenges challenge on challenge.id = event.challenge_id
  where event.id = p_daily_event_id for update of event;
  if not found then raise exception 'Daily event not found'; end if;
  if event_row.activated_at is not null then
    return jsonb_build_object('daily_event_id', event_row.id,
      'activated_at', event_row.activated_at, 'closes_at', event_row.closes_at,
      'already_active', true);
  end if;

  close_time := activation_time + make_interval(mins => least(event_row.window_minutes, 10));
  update public.daily_events
  set fires_at = activation_time, activated_at = activation_time, closes_at = close_time
  where id = event_row.id;

  perform public.enqueue_domain_event(
    'doji:global', 'doji.activated', event_row.id,
    jsonb_build_object(
      'dailyEventId', event_row.id, 'challengeId', event_row.challenge_id,
      'activatedAt', activation_time, 'closesAt', close_time,
      'windowMinutes', least(event_row.window_minutes, 10)
    ),
    'doji-activated:' || event_row.id::text
  );

  return jsonb_build_object('daily_event_id', event_row.id,
    'activated_at', activation_time, 'closes_at', close_time, 'already_active', false);
end;
$$;

create or replace function public.list_doji_push_fanout_shards(
  p_daily_event_id uuid
)
returns smallint[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row record;
  active_shards smallint[] := array[]::smallint[];
begin
  select event.activated_at, event.closes_at
  into event_row
  from public.daily_events event
  where event.id = p_daily_event_id;

  if not found or event_row.activated_at is null then
    raise exception 'Activated Doji not found';
  end if;

  if clock_timestamp() >= least(
    event_row.activated_at + interval '2 minutes',
    coalesce(event_row.closes_at, event_row.activated_at + interval '10 minutes')
  ) then
    update public.push_fanout_shards
    set status = 'expired', lease_id = null, leased_at = null,
        completed_at = coalesce(completed_at, clock_timestamp()), updated_at = now()
    where daily_event_id = p_daily_event_id
      and status in ('pending', 'processing');
    return active_shards;
  end if;

  select coalesce(
    array_agg(distinct profile.push_shard order by profile.push_shard),
    array[]::smallint[]
  )
  into active_shards
  from public.profiles profile
  where coalesce(profile.is_banned, false) = false
    and coalesce((profile.notification_preferences ->> 'push_enabled')::boolean, true)
    and coalesce((profile.notification_preferences ->> 'doji_start')::boolean, true)
    and (
      profile.notification_token is not null
      or exists (
        select 1
        from public.device_push_endpoints endpoint
        where endpoint.user_id = profile.id and endpoint.active = true
      )
    )
    and (
      not exists (
        select 1
        from public.daily_event_audience audience
        where audience.daily_event_id = p_daily_event_id
      )
      or exists (
        select 1
        from public.daily_event_audience audience
        where audience.daily_event_id = p_daily_event_id
          and audience.user_id = profile.id
      )
    );

  insert into public.push_fanout_shards (daily_event_id, shard)
  select p_daily_event_id, shard
  from unnest(active_shards) shard
  on conflict (daily_event_id, shard) do nothing;

  -- Retire rows produced by the former fixed 128-row activation contract.
  -- This is also safe when a recipient opts out between activation and plan
  -- creation: no provider handoff has occurred for a still-pending row.
  update public.push_fanout_shards
  set status = 'completed', lease_id = null, leased_at = null,
      completed_at = coalesce(completed_at, clock_timestamp()),
      last_error = null, updated_at = now()
  where daily_event_id = p_daily_event_id
    and status = 'pending'
    and not (shard = any(active_shards));

  return active_shards;
end;
$$;

create or replace function public.expire_doji_push_fanout(
  p_daily_event_id uuid,
  p_error text default 'Push launch lifetime expired'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer := 0;
begin
  update public.push_fanout_shards
  set status = 'expired', lease_id = null, leased_at = null,
      completed_at = coalesce(completed_at, clock_timestamp()),
      last_error = left(coalesce(p_error, 'Push launch lifetime expired'), 1000),
      updated_at = now()
  where daily_event_id = p_daily_event_id
    and status in ('pending', 'processing');
  get diagnostics changed = row_count;
  return changed;
end;
$$;

-- One-time repair for fixed partitions left behind by already-activated events.
update public.push_fanout_shards shard
set status = case
      when event.activated_at + interval '2 minutes' <= clock_timestamp()
        then 'expired'
      else 'completed'
    end,
    lease_id = null,
    leased_at = null,
    completed_at = coalesce(shard.completed_at, clock_timestamp()),
    last_error = case
      when event.activated_at + interval '2 minutes' <= clock_timestamp()
        then 'Retired by adaptive fanout migration'
      else null
    end,
    updated_at = now()
from public.daily_events event
where event.id = shard.daily_event_id
  and shard.status in ('pending', 'processing')
  and not exists (
    select 1
    from public.profiles profile
    where profile.push_shard = shard.shard
      and coalesce(profile.is_banned, false) = false
      and coalesce((profile.notification_preferences ->> 'push_enabled')::boolean, true)
      and coalesce((profile.notification_preferences ->> 'doji_start')::boolean, true)
      and (
        profile.notification_token is not null
        or exists (
          select 1 from public.device_push_endpoints endpoint
          where endpoint.user_id = profile.id and endpoint.active = true
        )
      )
      and (
        not exists (
          select 1 from public.daily_event_audience audience
          where audience.daily_event_id = shard.daily_event_id
        )
        or exists (
          select 1 from public.daily_event_audience audience
          where audience.daily_event_id = shard.daily_event_id
            and audience.user_id = profile.id
        )
      )
  );

revoke all on function public.activate_daily_event(uuid)
  from public, anon, authenticated;
grant execute on function public.activate_daily_event(uuid) to service_role;
revoke all on function public.list_doji_push_fanout_shards(uuid)
  from public, anon, authenticated;
grant execute on function public.list_doji_push_fanout_shards(uuid) to service_role;
revoke all on function public.expire_doji_push_fanout(uuid, text)
  from public, anon, authenticated;
grant execute on function public.expire_doji_push_fanout(uuid, text) to service_role;

comment on function public.list_doji_push_fanout_shards(uuid) is
  'Plans and returns only indexed push partitions containing eligible recipients.';
comment on function public.expire_doji_push_fanout(uuid, text) is
  'Terminalizes unfinished Doji-start push work when its immutable delivery lifetime ends.';

-- Expired fanout work has already been terminalized and alerted by the durable
-- fanout owner. It must not remain an "exhausted" health incident forever.
create or replace function public.get_operational_health()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with outbox as (
    select
      count(*) filter (
        where event.published_at is null
          and coalesce(event.available_at, event.created_at)
            < clock_timestamp() - interval '60 seconds'
      )::integer overdue,
      count(*) filter (
        where event.published_at is null and event.attempts >= 10
      )::integer exhausted,
      coalesce(max(extract(epoch from clock_timestamp()
        - coalesce(event.available_at, event.created_at))) filter (
          where event.published_at is null
            and coalesce(event.available_at, event.created_at) <= clock_timestamp()
        ), 0)::integer oldest_due_seconds
    from public.domain_event_outbox event
  ), realtime as (
    select
      count(*)::integer sample_count,
      coalesce(percentile_cont(0.95) within group (order by
        extract(epoch from event.realtime_published_at
          - greatest(event.created_at, event.available_at)) * 1000
      ), 0)::integer p95_ms,
      coalesce(max(extract(epoch from event.realtime_published_at
        - greatest(event.created_at, event.available_at)) * 1000), 0)::integer max_ms,
      count(*) filter (where event.realtime_published_at
        - greatest(event.created_at, event.available_at) > interval '5 seconds')::integer slow
    from public.domain_event_outbox event
    where event.realtime_published_at > clock_timestamp() - interval '5 minutes'
  ), push as (
    select
      count(*) filter (
        where shard.status in ('pending', 'processing')
          and shard.updated_at < clock_timestamp() - interval '60 seconds'
      )::integer stale,
      count(*) filter (
        where shard.status in ('pending', 'processing') and shard.attempts >= 8
      )::integer exhausted
    from public.push_fanout_shards shard
    join public.daily_events event on event.id = shard.daily_event_id
    where event.activated_at > clock_timestamp() - interval '1 day'
  ), provider as (
    select
      count(*)::integer credential_errors,
      max(claim.last_error) latest_credential_error
    from public.push_delivery_claims claim
    where claim.terminal_at > clock_timestamp() - interval '5 minutes'
      and (
        claim.last_error like '%TooManyProviderTokenUpdates%'
        or claim.last_error like '%InvalidProviderToken%'
        or claim.last_error like '%ExpiredProviderToken%'
      )
  )
  select jsonb_build_object(
    'healthy', outbox.overdue = 0 and outbox.exhausted = 0
      and (realtime.sample_count < 20 or realtime.p95_ms <= 5000)
      and realtime.max_ms <= 30000
      and push.stale = 0 and push.exhausted = 0
      and provider.credential_errors = 0,
    'checked_at', clock_timestamp(),
    'outbox_overdue', outbox.overdue,
    'outbox_exhausted', outbox.exhausted,
    'outbox_oldest_due_seconds', outbox.oldest_due_seconds,
    'realtime_sample_count_5m', realtime.sample_count,
    'realtime_p95_ms_5m', realtime.p95_ms,
    'realtime_max_ms_5m', realtime.max_ms,
    'realtime_over_5s_5m', realtime.slow,
    'push_stale_shards', push.stale,
    'push_exhausted_shards', push.exhausted,
    'apns_provider_credential_errors', provider.credential_errors,
    'apns_latest_provider_credential_error', provider.latest_credential_error
  )
  from outbox cross join realtime cross join push cross join provider;
$$;

revoke all on function public.get_operational_health()
  from public, anon, authenticated;
grant execute on function public.get_operational_health() to service_role;
