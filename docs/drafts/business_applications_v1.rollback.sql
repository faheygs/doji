-- Write/read pause only. Retain applications, consents, history, organizations,
-- receipts and audit. Never delete Auth users, revoke member sessions or drop data.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
update business_private.settings set enabled=false where singleton;
revoke execute on function public.get_business_application_v1(),public.get_business_workspace_v1(),
 public.business_application_command_v1(text,bigint,jsonb,text,text,uuid) from doji_business;
revoke execute on function public.get_admin_business_application_v1(uuid),
 public.get_admin_business_applications_page_v1(text,integer,timestamptz,uuid),
 public.admin_business_application_command_v1(uuid,bigint,text,text,text,uuid) from doji_employee;
-- Stop dedicated registration/sign-in/transport consumers and roll back only
-- independently qualified business/admin artifacts under the release runbook.
commit;
