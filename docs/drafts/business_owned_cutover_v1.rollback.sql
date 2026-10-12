-- Retaining emergency stop, NOT restoration of unfenced login or old sessions.
-- First keep owned ingress selected and sending disabled; retain signed-event
-- recovery while reconciling. Run this final freeze only after pending recovery
-- has been addressed or explicitly escalated. Never blindly restore old grants.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
update business_session_private.owned_auth_settings set enabled=false where singleton;
revoke execute on function business_session_private.put_owned_session_v1(text,text,text,text,integer,text,text,text,text)
 from doji_business_session;
commit;
