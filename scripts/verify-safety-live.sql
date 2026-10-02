begin read only;
set local statement_timeout='8s';
select jsonb_build_object(
 'at',clock_timestamp(),
 'capture',(select tgenabled from pg_trigger where tgname='capture_decision_media' and tgrelid='public.moderation_decisions'::regclass),
 'media_config',(select enabled from public.moderation_media_delivery_config where singleton),
 'alert_config',(select enabled from public.safety_removal_delivery_config where singleton),
 'intake_count',(select count(*) from public.safety_removal_cases),
 'holds',(select count(*) from public.moderation_media_objects),
 'media_size_summary',(select jsonb_agg(v) from (select bucket_id,count(*) objects,max(case when metadata->>'size' ~ '^[0-9]{1,12}$' then (metadata->>'size')::bigint end) max_bytes from storage.objects where bucket_id in('avatars','post-media') group by bucket_id)v),
 'member_policy',(select jsonb_agg(to_jsonb(p)) from public.mobile_release_policy p),
 'active_events',(select count(*) from public.daily_events where fires_at<=clock_timestamp() and fires_at+interval '10 minutes'>clock_timestamp()),
 'lock_waits',(select count(*) from pg_stat_activity where backend_type='client backend' and wait_event_type='Lock'),
 'overdue_outbox',(select count(*) from public.domain_event_outbox where published_at is null and available_at<clock_timestamp()-interval '60 seconds')
) checks;
rollback;
