begin read only;
set local statement_timeout='5s';
select jsonb_build_object(
 'captured_at',clock_timestamp(),
 'functions',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object(
   'hash',md5(pg_get_functiondef(p.oid)),'acl',p.proacl::text,'owner',p.proowner))
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'),
 'policies',(select jsonb_agg(to_jsonb(x) order by schemaname,tablename,policyname)
   from pg_policies x where schemaname in ('public','storage')),
 'relations',(select jsonb_object_agg(c.oid::regclass::text,jsonb_build_array(c.relacl,c.relrowsecurity,c.relforcerowsecurity))
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','storage') and c.relkind in ('r','v','p')),
 'triggers',(select md5(string_agg(pg_get_triggerdef(t.oid),'' order by t.oid)) from pg_trigger t
   join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname in ('public','auth','storage') and not t.tgisinternal),
 'role_settings',(select md5(string_agg(row_to_json(s)::text,'' order by setdatabase,setrole)) from pg_db_role_setting s),
 'indexes',(select jsonb_object_agg(schemaname||'.'||indexname,indexdef) from pg_indexes where schemaname in ('public','storage')),
 'default_acl',(select jsonb_agg(jsonb_build_object('role',r.rolname,'schema',n.nspname,'kind',d.defaclobjtype,'acl',d.defaclacl::text))
   from pg_default_acl d join pg_roles r on r.oid=d.defaclrole left join pg_namespace n on n.oid=d.defaclnamespace where n.nspname='public'),
 'editorial_tables',jsonb_build_object(
   'announcements',jsonb_build_object('rows',(select count(*) from public.app_announcements),'bytes',pg_total_relation_size('public.app_announcements')),
   'suggestions',jsonb_build_object('rows',(select count(*) from public.challenge_suggestions),'bytes',pg_total_relation_size('public.challenge_suggestions')),
   'audit',jsonb_build_object('rows',(select count(*) from public.admin_audit_log),'bytes',pg_total_relation_size('public.admin_audit_log'))),
 'migration_exists',exists(select 1 from supabase_migrations.schema_migrations where version='20260927030000'),
 'database_bytes',pg_database_size(current_database()),
 'next_event',(select min(fires_at) from public.daily_events where fires_at>clock_timestamp()),
 'active_events',(select count(*) from public.daily_events where fires_at<=clock_timestamp() and fires_at+interval '10 minutes'>clock_timestamp()),
 'overdue_outbox',(select count(*) from public.domain_event_outbox where published_at is null and available_at<clock_timestamp()-interval '60 seconds'),
 'lock_waits',(select count(*) from pg_stat_activity where backend_type='client backend' and wait_event_type='Lock')
) as baseline;
rollback;
