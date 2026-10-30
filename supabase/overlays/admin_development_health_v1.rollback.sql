-- Disable ADMIN_DEVELOPMENT_HEALTH_ENABLED first. Keep all health data and audit.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
lock table admin_development_private.routes in exclusive mode;
do $$begin
 if not exists(select 1 from admin_development_private.routes where name='get_admin_workflow_health_v1'
 and target='admin_development_private.workflow_health_v1()'::regprocedure
 and fields=array[]::text[] and types=array[]::text[] and defaults='{}'::jsonb) then
 raise exception 'Development health route drifted';end if;
end$$;
delete from admin_development_private.routes where name='get_admin_workflow_health_v1';
drop function admin_development_private.workflow_health_v1();
commit;
