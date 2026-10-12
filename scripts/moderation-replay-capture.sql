begin read only;
set local statement_timeout='8s';
select jsonb_build_object(
  'at',clock_timestamp(),
  'targets',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,
    'definition',pg_get_functiondef(p.oid),'hash',md5(pg_get_functiondef(p.oid)),
    'owner',p.proowner,'acl',p.proacl)) from pg_proc p where p.oid in (
      'public.admin_decide_report_v3(uuid,text,text,text,text,text,text,integer,text)'::regprocedure,
      'public.admin_review_moderation_appeal(uuid,text,text,text)'::regprocedure)),
  'functions',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object(
    'hash',md5(pg_get_functiondef(p.oid)),'owner',p.proowner,'acl',p.proacl))
    from pg_proc p where p.pronamespace in ('public'::regnamespace,'storage'::regnamespace)
    and p.prokind='f'),
  'active',(select count(*) from public.daily_events where fires_at<=clock_timestamp()
    and fires_at>clock_timestamp()-interval '15 minutes'),
  'next',(select min(fires_at) from public.daily_events where fires_at>clock_timestamp()),
  'locks',(select count(*) from pg_stat_activity where datname=current_database()
    and wait_event_type='Lock'),
  'receipt_view',md5(pg_get_viewdef('public.admin_portal_command_receipts'::regclass)),
  'policies',(select md5(coalesce(string_agg(row_to_json(p)::text,'' order by schemaname,tablename,policyname),'')) from pg_policies p)
) as baseline;
rollback;
