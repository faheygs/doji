-- Stop issuance/producers; retain applications, consent, history and receipts.
-- Also disable BUSINESS_REALTIME_ENABLED and browser realtimeEnabled.
-- Existing issued tokens expire within ten minutes; never revoke the shared key.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
update business_private.settings set realtime_enabled=false where singleton;
revoke all on function public.get_business_realtime_capability_v1() from public,anon,authenticated,doji_employee,doji_business,service_role;
commit;
