-- Exact staging-only identity cutover. Apply after the employee-directory adapter.
-- Leaves access disabled until verified subject mappings and runtime are installed.
begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
lock table portal_identity_private.realms in access exclusive mode;
lock table admin_development_private.settings in access exclusive mode;
lock table employee_session_private.settings in access exclusive mode;
do $$begin
 if not exists(select 1 from portal_identity_private.realms where realm='employee'
  and audience='client_01M3T5GJM7JZVQQ7CGHNJD0QMZ'
  and issuer='https://api.workos.com/user_management/client_01M3T5GJM7JZVQQ7CGHNJD0QMZ')
  or to_regclass('admin_development_private.directory_restore') is null
  or not exists(select 1 from pg_trigger where tgrelid='portal_identity_private.realms'::regclass
    and tgname='portal_realm_immutable' and tgenabled='O') then
  raise exception 'Exact staging realm and directory upgrade required';end if;
end$$;
create table admin_development_private.shared_identity_restore (
 singleton boolean primary key check(singleton), issuer text not null, audience text not null,
 scope_hash text, original text not null, installed_hash text not null
);
alter table admin_development_private.shared_identity_restore enable row level security;
revoke all on admin_development_private.shared_identity_restore from public,anon,authenticated,
 service_role,doji_employee,doji_business,doji_employee_application,doji_identity_resolver,doji_staging_development;

update admin_development_private.settings set enabled=false;
update employee_session_private.settings set enabled=false,generation=gen_random_uuid();
-- Old subjects belong to the old directory. Never reinterpret them under the new issuer.
insert into portal_identity_private.mapping_audit(principal_id,action,review_reference)
 select principal_id,'identity.revoked','Shared employee staging identity cutover'
 from portal_identity_private.identities where realm='employee' and not revoked;
update portal_identity_private.identities set revoked=true where realm='employee';
update portal_identity_private.principals set state='disabled',revision=revision+1
 where realm='employee' and state<>'deleted';
update public.admin_employees set status='disabled',updated_at=clock_timestamp()
 where id in(select id from portal_identity_private.principals where realm='employee');

do $cutover$
declare prior_definition text; changed text; target_signature text:='admin_development_private.invoke_v1(text,uuid,text,jsonb,uuid)';
 old_guard text:=$guard$and audience='client_01M3T5GJM7JZVQQ7CGHNJD0QMZ'
  and issuer='https://api.workos.com/user_management/client_01M3T5GJM7JZVQQ7CGHNJD0QMZ'$guard$;
begin
 prior_definition:=pg_get_functiondef(target_signature::regprocedure);
 if not exists(select 1 from admin_development_private.directory_restore r
  where r.signature=target_signature and r.installed_hash=md5(prior_definition)) then
  raise exception 'Directory adapter changed since reviewed installation';end if;
 changed:=replace(prior_definition,E'\r\n',E'\n');
 if (length(changed)-length(replace(changed,old_guard,'')))/length(old_guard)<>1 then
  raise exception 'Exact development realm guard required';end if;
 changed:=replace(changed,old_guard,$guard$and audience='client_01M51GRQJVKXFZ98RG21MK7J64'
  and issuer='https://api.workos.com/user_management/client_01M3VE4WTBYS2XN6NZPH9EDMQD'$guard$);
 execute changed;
 insert into admin_development_private.shared_identity_restore
  select true,r.issuer,r.audience,s.scope_hash,prior_definition,md5(pg_get_functiondef(target_signature::regprocedure))
  from portal_identity_private.realms r cross join employee_session_private.settings s
  where r.realm='employee' and s.singleton;
end$cutover$;
-- Exclusive table lock and exact preflight scope this one-time reassignment.
-- The immutable-realm trigger is restored before committing; it is not relaxed.
alter table portal_identity_private.realms disable trigger portal_realm_immutable;
update portal_identity_private.realms set enabled=false,
 issuer='https://api.workos.com/user_management/client_01M3VE4WTBYS2XN6NZPH9EDMQD',
 audience='client_01M51GRQJVKXFZ98RG21MK7J64' where realm='employee';
alter table portal_identity_private.realms enable trigger portal_realm_immutable;
update employee_session_private.settings set scope_hash=encode(extensions.digest(
 'https://admin-staging.dojipro.com|client_01M51GRQJVKXFZ98RG21MK7J64','sha256'),'hex');
commit;
