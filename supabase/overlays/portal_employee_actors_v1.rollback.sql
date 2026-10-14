-- Non-destructive fallback: freeze external employee identity/session access.
-- Keep attribution and the compatible legacy bridge. Restoring Auth-only foreign
-- keys after external employees have acted would strand or erase their history.
-- Existing legacy portal login/commands still work with these reference tables.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
update portal_identity_private.realms set enabled=false where realm='employee';
update employee_session_private.settings set enabled=false,generation=gen_random_uuid() where singleton;
revoke all on function portal_identity_private.prepare_employee_actor_v1(uuid,text)
 from public,anon,authenticated,doji_employee,doji_business,service_role,doji_identity_resolver;
commit;
