begin;
set local lock_timeout='2s';
set local statement_timeout='5s';
update business_private.email_sender_settings set enabled=false where singleton;
update business_private.email_settings set capture_enabled=false,sending_enabled=false where singleton;
revoke execute on function business_private.claim_application_email(uuid,uuid) from doji_business_mail;
-- Retain settings, jobs, budget and outcomes. Do not resend uncertain/claimed jobs.
commit;
