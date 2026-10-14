begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
update staff_workflow_private.settings set history_reads_enabled=false;
drop function portal_identity_private.employee_history_rpc_v1(text,text,text,text,boolean,text,jsonb);
commit;
