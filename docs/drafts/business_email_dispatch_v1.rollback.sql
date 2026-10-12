-- Stop/drain sender first. Retain evidence; an in-flight email cannot be recalled.
begin;
update business_private.email_settings set sending_enabled=false,capacity_verified_until=null;
revoke execute on function business_private.authorize_application_email(uuid,uuid) from doji_business_mail;
commit;
