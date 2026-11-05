-- Remove only the read bridge; retained device counts are not deleted.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
drop function portal_identity_private.employee_mobile_workflows_rpc_v1(text,text,text,text,boolean,text,jsonb);
drop function public.get_admin_mobile_workflows_v1();
commit;
