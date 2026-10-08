-- Additive fallback: disable and revoke entry points, retain ownership/audit.
-- No member/auth/source rows or existing functions are changed or removed.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
update staff_workflow_private.settings set enabled=false where singleton;
revoke execute on function public.get_admin_case_ownership_v1(text,uuid),
 public.get_admin_owned_work_page_v1(text,text,integer,timestamptz,text),
 public.admin_case_ownership_command_v1(text,uuid,bigint,text,text,uuid,uuid) from doji_employee;
commit;
