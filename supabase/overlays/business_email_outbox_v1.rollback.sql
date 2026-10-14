-- Freeze only this candidate; retain delivery evidence and preserve business records.
-- A provider request already in flight cannot be recalled. Stop/drain sender first.
begin;
set local lock_timeout='2s';
update business_private.email_settings set capture_enabled=false,sending_enabled=false,capacity_verified_until=null;
revoke execute on function business_private.claim_application_email(),business_private.finish_application_email(uuid,uuid,text,text) from doji_business_mail;
alter table business_private.history disable trigger business_application_email;
commit;
