-- Read-only, content-free launch inspection. No case/member mutations.
begin read only;
set local statement_timeout='5s';
select jsonb_build_object(
 'at',clock_timestamp(),
 'intake_installed',to_regclass('public.safety_removal_cases') is not null,
 'buckets',(select jsonb_agg(jsonb_build_object('id',id,'public',public)) from storage.buckets where id in ('avatars','post-media')),
 'shared_functions',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('md5',md5(pg_get_functiondef(p.oid)),'definition',pg_get_functiondef(p.oid),'acl',p.proacl::text))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and (p.proname in ('trg_enforce_write_rate_limit','publish_reporter_visibility_change','trg_report_notify_admin','enforce_owned_profile_avatar','public_storage_object_path') or p.proname like 'admin_decide_report%' or p.proname like 'admin_review_moderation_appeal%')),
 'storage_policies',(select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname='storage' and tablename='objects'),
 'profile_triggers',(select jsonb_agg(jsonb_build_object('trigger',pg_get_triggerdef(t.oid),'function',t.tgfoid::regprocedure::text,'definition',pg_get_functiondef(t.tgfoid))) from pg_trigger t where t.tgrelid='public.profiles'::regclass and not t.tgisinternal),
 'safety_jobs',(select jsonb_agg(jsonb_build_object('id',jobid,'name',jobname,'schedule',schedule,'active',active)) from cron.job where jobname like 'safety-removal-%'),
 'active_events',(select count(*) from public.daily_events where fires_at<=clock_timestamp() and fires_at+interval '10 minutes'>clock_timestamp()),
 'overdue_outbox',(select count(*) from public.domain_event_outbox where published_at is null and available_at<clock_timestamp()-interval '60 seconds'),
 'lock_waits',(select count(*) from pg_stat_activity where backend_type='client backend' and wait_event_type='Lock')
) as checks;
rollback;
