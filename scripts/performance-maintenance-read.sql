begin read only;
set local statement_timeout='5s';
set local lock_timeout='1s';
select jsonb_build_object(
 'at',clock_timestamp(),
 'health',public.get_operational_health(),
 'active',(select count(*) from public.daily_events where fires_at<=clock_timestamp() and fires_at+interval '10 minutes'>clock_timestamp()),
 'next',(select min(fires_at) from public.daily_events where fires_at>clock_timestamp()),
 'pending_due',(select count(*) from public.domain_event_outbox where published_at is null and available_at<=clock_timestamp()),
 'locks',(select count(*) from pg_stat_activity where backend_type='client backend' and wait_event_type='Lock'),
 'suggestion_policies',(select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p where schemaname='public' and tablename='challenge_suggestions'),
 'admin_predicate',pg_get_functiondef('public.is_current_user_admin()'::regprocedure),
 'admin_predicate_acl',(select proacl::text from pg_proc where oid='public.is_current_user_admin()'::regprocedure),
 'suggestion_acl',(select relacl::text from pg_class where oid='public.challenge_suggestions'::regclass),
 'shared_buffers',current_setting('shared_buffers')
) as maintenance;
rollback;
