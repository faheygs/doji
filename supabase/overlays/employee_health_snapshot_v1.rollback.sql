-- Retaining rollback: stop collection/reads and revoke entry points; keep observations.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
update employee_health_snapshot_private.settings set enabled=false where id;
revoke all on function public.capture_employee_health_snapshot_v1(text,jsonb) from service_role;
revoke all on function public.get_admin_health_snapshot_v1(boolean) from doji_employee;
revoke all on function portal_identity_private.employee_health_snapshot_rpc_v1(text,text,text,text,boolean,text,jsonb) from doji_employee_application;
commit;
