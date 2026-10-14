-- Retaining fallback: shared gate fences in-flight work before denying the bridge.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
update staff_workflow_private.settings set enabled=false where singleton;
revoke execute on function portal_identity_private.employee_workflow_rpc_v1(text,text,text,text,boolean,text,jsonb)
 from doji_employee_application;
-- Existing independent employee dispatcher and source/audit records stay intact.
commit;
