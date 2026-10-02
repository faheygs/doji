begin read only;
set local statement_timeout = '5s';
select jsonb_build_object(
  'captured_at', clock_timestamp(),
  'server_version', current_setting('server_version'),
  'push_definition', pg_get_functiondef('public.register_push_token(text)'::regprocedure),
  'functions', (select jsonb_object_agg(p.oid::regprocedure::text, jsonb_build_object(
    'hash', md5(pg_get_functiondef(p.oid)), 'acl', p.proacl::text, 'owner', p.proowner))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f'),
  'policies', (select md5(coalesce(string_agg(row_to_json(x)::text,'' order by x.schemaname,x.tablename,x.policyname),''))
    from pg_policies x where schemaname in ('public','storage')),
  'relations', (select md5(coalesce(string_agg(jsonb_build_array(c.oid::regclass::text,c.relacl,c.relrowsecurity,c.relforcerowsecurity)::text,'' order by c.oid),''))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','storage') and c.relkind in ('r','v','p')),
  'triggers', (select md5(coalesce(string_agg(pg_get_triggerdef(t.oid),'' order by t.oid),''))
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','auth','storage') and not t.tgisinternal),
  'role_settings', (select md5(coalesce(string_agg(row_to_json(s)::text,'' order by setdatabase,setrole),'')) from pg_db_role_setting s),
  'window', (select jsonb_build_object('now',clock_timestamp(), 'next',min(fires_at))
    from public.daily_events where fires_at > clock_timestamp()),
  'active_event_count', (select count(*) from public.daily_events
    where fires_at <= clock_timestamp() and fires_at + interval '10 minutes' > clock_timestamp()),
  'overdue_outbox', (select count(*) from public.domain_event_outbox
    where published_at is null and available_at < clock_timestamp() - interval '60 seconds'),
  'client_lock_waits', (select count(*) from pg_stat_activity
    where backend_type='client backend' and wait_event_type='Lock')
) as baseline;
commit;
