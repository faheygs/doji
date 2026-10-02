-- Operator-triggered rollback ONLY; not executed by the release.
-- Also disable the dedicated BUSINESS_AUTH_ENABLED secret before restoring the
-- closed business Pages deployment. Keep existing member/admin auth untouched.
begin;
set local lock_timeout='2s';set local statement_timeout='8s';
select pg_advisory_xact_lock(hashtextextended('doji-business-release-20260930',0));
update business_private.public_auth_settings set enabled=false,registration_open=false where singleton;
revoke doji_business from authenticator;
-- Preserve every account, consent, application, receipt and budget count.
-- Staff may retain restricted access to address any existing business cases.
notify pgrst,'reload schema';
commit;
