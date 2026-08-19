-- One bounded service-role snapshot powers free-tier logs today and an alert
-- webhook/Sentry destination later without changing the database contract.

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
  )
  select jsonb_build_object(
    'healthy', outbox.overdue = 0 and outbox.exhausted = 0
      and push.stale = 0 and push.exhausted = 0,
    'checked_at', clock_timestamp(),
    'outbox_overdue', outbox.overdue,
    'outbox_exhausted', outbox.exhausted,
    'outbox_oldest_due_seconds', outbox.oldest_due_seconds,
    'push_stale_shards', push.stale,
    'push_exhausted_shards', push.exhausted
  )
  from outbox cross join push;
$$;

revoke all on function public.get_operational_health()
  from public, anon, authenticated;
grant execute on function public.get_operational_health() to service_role;
