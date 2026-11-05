-- Retains device counts and developer audit; removes only the staging read route.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
lock table admin_development_private.routes in exclusive mode;
do $$begin
 if not exists(select 1 from admin_development_private.routes where name='get_admin_mobile_workflows_v1'
  and target='admin_development_private.mobile_workflows_v1()'::regprocedure
  and fields=array[]::text[] and types=array[]::text[] and defaults='{}'::jsonb) then
  raise exception 'Development device-report route drifted';end if;
end$$;
delete from admin_development_private.routes where name='get_admin_mobile_workflows_v1';
drop function admin_development_private.mobile_workflows_v1();
commit;
