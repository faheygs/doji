-- Staging-only parity for the gated employee health revision read. No member changes.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
do $$begin
 if not exists(select 1 from portal_identity_private.realms where realm='employee'
  and issuer='https://api.workos.com/user_management/client_01M3VE4WTBYS2XN6NZPH9EDMQD'
  and audience='client_01M51GRQJVKXFZ98RG21MK7J64') then
  raise exception 'Shared staging employee realm required';end if;
end$$;
create function admin_development_private.health_feed_v1() returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
 if auth.jwt()->>'aal' is distinct from 'staging_development'
  or not admin_development_private.assurance_v1(auth.jwt()->>'aal')
  or not public.admin_user_has_permission('operations.read') then
  raise exception using errcode='42501',message='Development operations access required';end if;
 return jsonb_build_object('enabled',exists(select 1 from employee_health_private.settings where id and enabled),
  'sources',coalesce((select jsonb_agg(jsonb_build_object('source',source,'revision',revision::text,'observed_at',observed_at) order by source)
   from employee_health_private.sources),'[]'::jsonb));
end$$;
revoke all on function admin_development_private.health_feed_v1() from public,anon,authenticated,
 service_role,doji_employee,doji_business,doji_employee_application,doji_staging_development;
insert into admin_development_private.routes values('get_admin_health_feed_v1',
 'admin_development_private.health_feed_v1()'::regprocedure,array[]::text[],array[]::text[],'{}'::jsonb);
commit;
