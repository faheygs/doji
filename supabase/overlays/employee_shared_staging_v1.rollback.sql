-- Disable staging access first; preserve employees, audit and encrypted session evidence.
begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
update admin_development_private.settings set enabled=false;
update employee_session_private.settings set enabled=false,generation=gen_random_uuid();
update portal_identity_private.realms set enabled=false where realm='employee';
commit;
begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
lock table portal_identity_private.realms in access exclusive mode;
do $$declare r admin_development_private.shared_identity_restore%rowtype;
begin
 select * into strict r from admin_development_private.shared_identity_restore where singleton;
 if not exists(select 1 from portal_identity_private.realms where realm='employee'
  and audience='client_01M51GRQJVKXFZ98RG21MK7J64'
  and issuer='https://api.workos.com/user_management/client_01M3VE4WTBYS2XN6NZPH9EDMQD')
  or md5(pg_get_functiondef('admin_development_private.invoke_v1(text,uuid,text,jsonb,uuid)'::regprocedure))<>r.installed_hash then
  raise exception 'Refusing rollback over changed staging configuration';end if;
 execute r.original;
 alter table portal_identity_private.realms disable trigger portal_realm_immutable;
 update portal_identity_private.realms set issuer=r.issuer,audience=r.audience where realm='employee';
 alter table portal_identity_private.realms enable trigger portal_realm_immutable;
 update employee_session_private.settings set scope_hash=r.scope_hash where singleton;
end$$;
-- Explicit old-directory reactivation is required after restoring its runtime.
update portal_identity_private.identities set revoked=true where realm='employee';
commit;
