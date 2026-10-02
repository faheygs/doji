-- Read-only incident diagnosis; no content, recipient identities, tokens or writes.
begin read only;
set local statement_timeout='5s';
set local lock_timeout='1s';
select 'current_health' as section, public.get_operational_health() as facts;
select 'alert_receipt' as section, created_at, issue_family,
  payload->'observed_at' as observed_at,
  payload->'realtime_p95_ms_5m' as p95,
  payload->'realtime_sample_count_5m' as samples,
  payload->'diagnostics' as diagnostics
from public.operational_alert_deliveries
where created_at >= '2026-09-27T19:30:00Z' and created_at < '2026-09-27T19:45:00Z'
order by created_at limit 10;
select 'window_by_minute' as section, date_trunc('minute',realtime_published_at) as minute,
  count(*) as samples,
  round((percentile_cont(0.95) within group(order by extract(epoch from realtime_published_at-greatest(created_at,available_at))*1000))::numeric) as p95_ms,
  round(max(extract(epoch from realtime_published_at-greatest(created_at,available_at))*1000)::numeric) as max_ms,
  count(*) filter(where realtime_published_at-greatest(created_at,available_at)>interval '5 seconds') as over_5s,
  count(*) filter(where realtime_publish_attempts>1) as retried
from public.domain_event_outbox
where realtime_published_at >= '2026-09-27T19:25:00Z' and realtime_published_at < '2026-09-27T19:50:00Z'
group by 2 order by 2 limit 25;
select 'slow_or_retried' as section,event_type,created_at,available_at,realtime_published_at,published_at,
  realtime_publish_attempts,
  round((extract(epoch from realtime_published_at-greatest(created_at,available_at))*1000)::numeric) as latency_ms,
  (last_error is not null) as retained_error
from public.domain_event_outbox
where realtime_published_at >= '2026-09-27T19:30:00Z' and realtime_published_at < '2026-09-27T19:40:00Z'
  and (realtime_publish_attempts>1 or realtime_published_at-greatest(created_at,available_at)>interval '5 seconds')
order by realtime_published_at limit 30;
rollback;
