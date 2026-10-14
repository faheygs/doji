-- Freeze delivery; preserve spent reservations and all existing reset fences.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
update business_session_private.owned_auth_mail_settings set enabled_until=null where singleton;
revoke execute on function business_session_private.reserve_owned_recovery_email_v1(text,text) from doji_business_session;
commit;
