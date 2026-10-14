-- Disable portal/server compose gates before removing only this added bridge.
begin;
set local lock_timeout='2s';
drop function portal_identity_private.employee_announcement_rpc_v1(text,text,text,text,boolean,text,jsonb);
commit;
