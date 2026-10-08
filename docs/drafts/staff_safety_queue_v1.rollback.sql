-- Roll back portal/runtime first; preserves all cases, assignments and audit rows.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
drop function portal_identity_private.employee_workflow_rpc_v1(text,text,text,text,boolean,text,jsonb);
alter function portal_identity_private.employee_workflow_before_safety_v1(text,text,text,text,boolean,text,jsonb)
 rename to employee_workflow_rpc_v1;
grant execute on function portal_identity_private.employee_workflow_rpc_v1(text,text,text,text,boolean,text,jsonb) to doji_employee_application;
drop function public.get_admin_safety_work_page_v1(text,boolean,text,text,integer,timestamptz,text);
alter table staff_workflow_private.settings drop column safety_queue_enabled;
commit;
