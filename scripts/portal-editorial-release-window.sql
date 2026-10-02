begin read only;
set local statement_timeout='5s';
select jsonb_build_object(
 'at',clock_timestamp(),
 'active',(select count(*) from public.daily_events where fires_at<=clock_timestamp() and fires_at+interval '10 minutes'>clock_timestamp()),
 'next',(select min(fires_at) from public.daily_events where fires_at>clock_timestamp()),
 'overdue',(select count(*) from public.domain_event_outbox where published_at is null and available_at<clock_timestamp()-interval '60 seconds'),
 'locks',(select count(*) from pg_stat_activity where backend_type='client backend' and wait_event_type='Lock')
) as release_window;
rollback;
