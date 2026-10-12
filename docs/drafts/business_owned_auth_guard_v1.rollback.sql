-- Retaining rollback: stop new owned-auth commands; preserve fences and receipts.
-- No member/employee changes, session restoration or fallback to unfenced login.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
update business_session_private.owned_auth_settings set enabled=false where singleton;
revoke execute on function business_session_private.admit_owned_auth_v1(text,text,text,text,text),
 business_session_private.put_owned_session_v1(text,text,text,text,integer,text,text,text,text),
 business_session_private.begin_owned_reset_v1(text,text,text,text,text),
 business_session_private.complete_owned_reset_v1(text,text,text,text,text) from doji_business_session;
commit;
