-- Admission-only rollback; retains accounts, applications, evidence and counters.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
update business_private.public_auth_settings set enabled=false,registration_open=false where singleton;
revoke all on function public.claim_public_business_auth_v1(text,text) from service_role;
-- Also turn off BUSINESS_AUTH_PUBLIC_ADMISSION and BUSINESS_AUTH_ENABLED at the
-- dedicated boundary. Do NOT fall back to enabling the old invitation gate.
commit;
