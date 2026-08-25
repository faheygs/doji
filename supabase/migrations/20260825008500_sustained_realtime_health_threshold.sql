-- Alert on sustained realtime degradation, not a handful of slow deliveries in
-- a low-traffic window. A single catastrophic delay still pages immediately.

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
        where shard.status <> 'completed' and shard.attempts >= 8
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

comment on function public.get_operational_health() is
  'Operational snapshot with sustained realtime SLO and catastrophic-delay thresholds.';
