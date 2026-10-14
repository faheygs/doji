-- Retaining stop: preserve identity, application, reservation, audit and reset fences.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
update business_session_private.owned_auth_acceptance
 set existing_account_access=false where singleton;
commit;
