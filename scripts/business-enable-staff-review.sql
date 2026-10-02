-- Release only staff review of the new business contracts. Public Auth remains
-- disabled and doji_business is NOT granted to authenticator in this step.
begin;
set local lock_timeout='2s';set local statement_timeout='8s';
select pg_advisory_xact_lock(hashtextextended('doji-business-release-20260930',0));
do $$begin
 if exists(select 1 from business_private.settings where enabled or realtime_enabled or application_terms_version is not null or privacy_version is not null)
 or exists(select 1 from business_private.privacy_settings where enabled)
 or exists(select 1 from business_private.public_auth_settings where enabled or registration_open or registrations_used<>0 or emails_used<>0)
 or exists(select 1 from auth.users where role='doji_business')
 or pg_has_role('authenticator','doji_business','member') then
  raise exception 'Unexpected existing business state; stop';
 end if;
end$$;
update business_private.settings set enabled=true,
 application_terms_version='business-terms-20260930-v1',privacy_version='business-privacy-20260930-v1'
where singleton;
update business_private.privacy_settings set enabled=true where singleton;
notify pgrst,'reload schema';
commit;
