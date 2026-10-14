-- Disable first. No domain records, assignments, history, or member contracts removed.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
update staff_workflow_private.settings set history_reads_enabled=false;
drop function public.get_admin_personal_work_page_v1(text,text,integer,timestamptz,text);
drop function public.get_admin_announcement_lifecycle_page_v1(text,integer,timestamptz,uuid);
drop function staff_workflow_private.history_reads_actor();
alter table staff_workflow_private.settings drop column history_reads_enabled;
commit;
