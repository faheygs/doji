-- Close Auth signup first, then disable admission; retain every account and its evidence.
-- Keep the installed hook bound until Auth signup is verified disabled.
begin;
set local lock_timeout='2s';
update staging_mobile_auth_private.settings set enabled=false where id;
commit;
