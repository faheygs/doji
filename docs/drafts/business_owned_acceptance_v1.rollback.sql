-- Close test admission only; preserve the spent slot, session/reset fences and
-- signed reset reconciliation. Does not reopen public or legacy authentication.
begin;
set local lock_timeout='2s';
set local statement_timeout='5s';
select 1 from business_session_private.owned_auth_settings where singleton for update;
update business_session_private.owned_auth_acceptance set enabled=false where singleton;
revoke execute on function business_session_private.admit_owned_acceptance_v1(text,text,text,text,text),
 business_session_private.reserve_owned_acceptance_v1(text,text,text,text) from doji_business_session;
commit;
