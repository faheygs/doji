-- Pause only the separate business admission service; retain evidence/budgets.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
update business_private.auth_settings set enabled=false where singleton;
revoke execute on function public.claim_business_auth_v1(text,text) from service_role;
commit;
