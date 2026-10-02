begin read only;
set local statement_timeout='5s';
set local lock_timeout='1s';
with minutes as (
  select date_trunc('minute', realtime_published_at) as minute,
    count(*) as samples,
    round((percentile_cont(0.95) within group(order by extract(epoch from realtime_published_at-greatest(created_at,available_at))*1000))::numeric) as p95_ms,
    round(max(extract(epoch from realtime_published_at-greatest(created_at,available_at))*1000)::numeric) as max_ms,
    count(*) filter(where realtime_published_at-greatest(created_at,available_at)>interval '5 seconds') as over_5s,
    count(*) filter(where realtime_publish_attempts>1) as retried
  from public.domain_event_outbox
  where realtime_published_at >= '2026-09-27T19:30:00Z' and realtime_published_at < '2026-09-27T19:50:00Z'
  group by 1
)
select now() as checked_at, public.get_operational_health() as current_health,
  (select jsonb_agg(to_jsonb(m) order by minute) from minutes m) as incident_minutes;
rollback;
