-- Disable workflowHealthEnabled in the employee runtime first. Retain all measurements.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
drop function portal_identity_private.employee_workflow_health_rpc_v1(text,text,text,text,boolean,text,jsonb);
drop function public.get_admin_workflow_health_v1();
commit;
