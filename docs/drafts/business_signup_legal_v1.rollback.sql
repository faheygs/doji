-- Close business registration/application entry points first; retain immutable evidence.
begin;
update business_private.settings set enabled=false,realtime_enabled=false where singleton;
update business_private.auth_settings set enabled=false where singleton;
update business_private.public_auth_settings set enabled=false,registration_open=false where singleton;
revoke all on function public.check_business_signup_legal_v1(text,text) from service_role;
-- Keep the business-only trigger: removing it would reopen an unrecorded signup path.
-- Member/employee creation does not invoke it. No data is deleted by rollback.
commit;
