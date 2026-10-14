begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
update business_session_private.settings set registration_enabled=false where singleton;
revoke execute on function business_session_private.reserve_registration(text,text,text) from doji_business_registration;
-- Keep bounded receipts and counters so a future re-enable cannot reset capacity.
commit;
