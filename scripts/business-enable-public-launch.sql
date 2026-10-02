-- Exact approved US-only 10-account/30-email launch. No member contracts touched.
begin;
set local lock_timeout='2s';set local statement_timeout='8s';
select pg_advisory_xact_lock(hashtextextended('doji-business-release-20260930',0));
do $$begin
 if not exists(select 1 from business_private.settings where enabled and not realtime_enabled
  and application_terms_version='business-terms-20260930-v1' and privacy_version='business-privacy-20260930-v1')
 or exists(select 1 from business_private.public_auth_settings where enabled or registration_open or registrations_used<>0 or emails_used<>0)
 or exists(select 1 from business_private.auth_settings where enabled)
 or exists(select 1 from auth.users where role='doji_business')
 or pg_has_role('authenticator','doji_business','member') then raise exception 'Business launch state changed; stop'; end if;
end$$;
-- Private constraint also covers stale/manually scripted clients and staff corrections.
-- Empty drafts remain valid; submission RPC independently requires every field.
alter table business_private.applications add constraint business_launch_country_us
 check(coalesce(details->>'country','') in ('','US'));
update business_private.public_auth_settings set enabled=true,registration_open=true,
 admission_until='2026-10-07T23:59:59Z',registration_limit=10,email_limit=30,daily_email_limit=30
where singleton;
grant doji_business to authenticator;
notify pgrst,'reload schema';
commit;
