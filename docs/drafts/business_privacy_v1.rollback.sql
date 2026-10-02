-- Freeze only this workflow. No automatic restore or destruction of evidence.
begin;
update business_private.privacy_settings set enabled=false where singleton;
revoke all on function public.admin_business_privacy_open_v1(uuid,text,text,timestamptz,uuid),
 public.get_admin_business_privacy_page_v1(text,timestamptz,uuid),public.get_admin_business_privacy_access_v1(uuid,bigint),
 public.get_admin_business_privacy_case_v1(uuid,bigint),
 public.get_admin_business_privacy_correction_v1(uuid),
 public.admin_business_privacy_command_v1(uuid,bigint,text,text,uuid,jsonb,bigint) from doji_employee;
revoke all on function public.claim_business_erasure_v1(uuid,uuid),public.finish_business_erasure_v1(uuid,uuid) from service_role;
-- Keep disabled business accounts disabled; preserve cases, holds and receipts.
-- In-flight Auth deletion may already have happened; reconcile before any resume.
commit;
