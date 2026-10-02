-- Capture connection defaults before transaction-local safety overrides.
select current_setting('statement_timeout') as connection_statement_timeout,
 current_setting('lock_timeout') as connection_lock_timeout;
begin read only;
set local statement_timeout='5s';
set local lock_timeout='1s';
select jsonb_build_object(
 'at',clock_timestamp(),
 'server_version',current_setting('server_version'),
 'functions',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object(
   'hash',md5(pg_get_functiondef(p.oid)),'acl',p.proacl::text,'owner',p.proowner))
   from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'),
 'originals',(select jsonb_object_agg(p.oid::regprocedure::text,pg_get_functiondef(p.oid))
   from pg_proc p where p.oid in('public.sync_comment_mentions(uuid,text,uuid)'::regprocedure,
     'public.get_notification_center_snapshot_without_post_context(timestamptz,integer)'::regprocedure)),
 'policies',(select jsonb_agg(to_jsonb(x) order by schemaname,tablename,policyname)
   from pg_policies x where schemaname in ('public','storage')),
 'relations',(select jsonb_object_agg(c.oid::regclass::text,jsonb_build_array(c.relacl,c.relrowsecurity,c.relforcerowsecurity))
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','storage') and c.relkind in ('r','v','p')),
 'triggers',(select md5(string_agg(pg_get_triggerdef(t.oid),'' order by t.oid)) from pg_trigger t
   join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname in ('public','auth','storage') and not t.tgisinternal),
 'role_settings',(select md5(string_agg(row_to_json(s)::text,'' order by setdatabase,setrole)) from pg_db_role_setting s),
 'indexes',(select jsonb_object_agg(schemaname||'.'||indexname,indexdef) from pg_indexes where schemaname in ('public','storage')),
 'index_state',(select jsonb_object_agg(c.relname,jsonb_build_object('valid',i.indisvalid,'ready',i.indisready,'bytes',pg_relation_size(c.oid)))
   from pg_index i join pg_class c on c.oid=i.indexrelid where c.relname in ('comments_author_created_idx','reactions_author_created_idx')),
 'default_acl',(select jsonb_agg(jsonb_build_object('role',r.rolname,'schema',n.nspname,'kind',d.defaclobjtype,'acl',d.defaclacl::text))
   from pg_default_acl d join pg_roles r on r.oid=d.defaclrole left join pg_namespace n on n.oid=d.defaclnamespace where n.nspname='public'),
 'tables',(select jsonb_object_agg(c.relname,jsonb_build_object('estimated_rows',c.reltuples,'total_bytes',pg_total_relation_size(c.oid)))
   from pg_class c where c.oid in ('public.comments'::regclass,'public.reactions'::regclass)),
 'database_bytes',pg_database_size(current_database()),
 'next_event',(select min(fires_at) from public.daily_events where fires_at>clock_timestamp()),
 'active_events',(select count(*) from public.daily_events where fires_at<=clock_timestamp() and fires_at+interval '10 minutes'>clock_timestamp()),
 'overdue_outbox',(select count(*) from public.domain_event_outbox where published_at is null and available_at<clock_timestamp()-interval '60 seconds'),
 'lock_waits',(select count(*) from pg_stat_activity where backend_type='client backend' and wait_event_type='Lock')
) as baseline;
rollback;
