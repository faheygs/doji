-- Disable owned auth first. Retain metadata, pending fences and success evidence.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
update business_session_private.owned_auth_settings set enabled=false where singleton;
revoke execute on function business_session_private.put_owned_reset_link_v1(text,text,text,text,bigint,text,text,text),
 business_session_private.get_owned_reset_link_v1(text,text),
 business_session_private.begin_owned_reset_link_v1(text,text,text,text,text,text),
 business_session_private.complete_owned_reset_link_v1(text,text,text,text,text),
 business_session_private.reconcile_owned_reset_link_v1(text,text,text,text,text,text) from doji_business_session;
commit;
