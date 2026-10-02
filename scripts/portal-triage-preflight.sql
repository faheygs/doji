begin read only;
set local statement_timeout='5s';
select jsonb_build_object(
 'captured_at',clock_timestamp(),
 'functions',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object(
   'hash',md5(pg_get_functiondef(p.oid)),'acl',p.proacl::text,'owner',p.proowner))
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'),
 'policies',(select jsonb_agg(to_jsonb(x) order by schemaname,tablename,policyname)
   from pg_policies x where schemaname in ('public','storage')),
 'relations',(select md5(string_agg(jsonb_build_array(c.oid::regclass::text,c.relacl,c.relrowsecurity,c.relforcerowsecurity)::text,'' order by c.oid))
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','storage') and c.relkind in ('r','v','p')),
 'triggers',(select md5(string_agg(pg_get_triggerdef(t.oid),'' order by t.oid)) from pg_trigger t
   join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname in ('public','auth','storage') and not t.tgisinternal),
 'role_settings',(select md5(string_agg(row_to_json(s)::text,'' order by setdatabase,setrole)) from pg_db_role_setting s),
 'indexes',(select jsonb_object_agg(schemaname||'.'||indexname,indexdef) from pg_indexes where schemaname in ('public','storage')),
 'decision_rows',(select count(*) from public.moderation_decisions),
 'avatar_decision_rows',(select count(*) from public.moderation_decisions where content_kind='profile_photo'),
 'decision_bytes',pg_total_relation_size('public.moderation_decisions'),
 'database_bytes',pg_database_size(current_database()),
 'avatar_bucket_public',(select public from storage.buckets where id='avatars'),
 'next_event',(select min(fires_at) from public.daily_events where fires_at>clock_timestamp()),
 'active_events',(select count(*) from public.daily_events where fires_at<=clock_timestamp() and fires_at+interval '10 minutes'>clock_timestamp()),
 'overdue_outbox',(select count(*) from public.domain_event_outbox where published_at is null and available_at<clock_timestamp()-interval '60 seconds'),
 'lock_waits',(select count(*) from pg_stat_activity where backend_type='client backend' and wait_event_type='Lock')
) as baseline;
rollback;
