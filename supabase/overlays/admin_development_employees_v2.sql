-- Staging-only upgrade. Employee records own the directory; developer authority is separate.
begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
do $$begin
 if not exists(select 1 from portal_identity_private.realms where realm='employee'
  and audience='client_01M3T5GJM7JZVQQ7CGHNJD0QMZ'
  and issuer='https://api.workos.com/user_management/client_01M3T5GJM7JZVQQ7CGHNJD0QMZ') then
  raise exception 'Exact staging employee realm required';end if;
end$$;
-- No existing credential silently acquires directory-wide impersonation rights.
alter table admin_development_private.credentials add column employee_directory_access boolean not null default false;
create table admin_development_private.directory_restore (
 signature text primary key, original text not null, installed_hash text not null
);
alter table admin_development_private.directory_restore enable row level security;
revoke all on admin_development_private.directory_restore from public,anon,authenticated,service_role,doji_employee,doji_business,doji_employee_application,doji_identity_resolver,doji_staging_development;
-- Historical audit identities remain valid without a duplicate persona registration.
alter table admin_development_private.context drop constraint context_persona_id_fkey;
alter table admin_development_private.context add foreign key(persona_id) references portal_identity_private.staff_actors(id);
alter table admin_development_private.audit drop constraint audit_persona_id_fkey;
alter table admin_development_private.audit add foreign key(persona_id) references portal_identity_private.staff_actors(id);

create function admin_development_private.employees_v2(p_credential uuid)
returns table(id uuid,label text) language sql stable security definer set search_path='' as $$
 select e.id,coalesce(nullif(btrim(e.display_name),''),c.email)||' · '||c.email
 from admin_development_private.credentials k
 join public.admin_employees e on e.status='active' and cardinality(e.roles)>0
 join portal_identity_private.staff_actors a on a.id=e.id and a.employee_principal_id=e.id and a.legacy_auth_id is null
 join portal_identity_private.principals p on p.id=e.id and p.realm='employee' and p.state='active'
 join portal_identity_private.employee_contacts c on c.id=e.id
 where k.id=p_credential and k.enabled and k.expires_at>statement_timestamp()
 and (k.employee_directory_access or exists(
  select 1 from admin_development_private.grants g
  join admin_development_private.personas legacy on legacy.id=g.persona_id and legacy.enabled
  where g.credential_id=k.id and g.persona_id=e.id))
 and exists(select 1 from portal_identity_private.identities i
  where i.principal_id=e.id and i.realm='employee' and not i.revoked)
 and not exists(select 1 from auth.users where id=e.id)
 and not exists(select 1 from public.profiles where id=e.id)
 and not exists(select 1 from business_private.accounts where id=e.id)
$$;
revoke all on function admin_development_private.employees_v2(uuid) from public,anon,authenticated,service_role,doji_employee,doji_business,doji_employee_application,doji_identity_resolver,doji_staging_development;

-- Replace only the reviewed v1 directory/selection blocks, leaving command routing intact.
-- Exact substring checks stop a release if the installed adapter has changed.
do $upgrade$
declare signature text; original text; changed text; old_block text; new_block text;
begin
 signature:='admin_development_private.invoke_v1(text,uuid,text,jsonb,uuid)';
 original:=pg_get_functiondef(signature::regprocedure);
 changed:=replace(original,E'\r\n',E'\n');
 old_block:=$old$ from (select p.id,p.label from admin_development_private.personas p
   join admin_development_private.grants g on g.persona_id=p.id and g.credential_id=k.id
   join public.admin_employees e on e.id=p.id and e.status='active'
   join portal_identity_private.principals principal on principal.id=p.id and principal.realm='employee' and principal.state='active'
   where p.enabled and not exists(select 1 from auth.users where id=p.id)
    and not exists(select 1 from public.profiles where id=p.id)
    and not exists(select 1 from business_private.accounts where id=p.id)
   order by p.label,p.id limit 25) p;$old$;
 new_block:=$new$ from (select p.id,p.label from admin_development_private.employees_v2(k.id) p
   order by p.label,p.id limit 101) p;
  if jsonb_array_length(result->'personas')>100 then
   raise exception using errcode='22023',message='Employee directory exceeds supported selection capacity';end if;$new$;
 if position(old_block in changed)=0 then raise exception 'Directory definition drift';end if;
 changed:=replace(changed,old_block,new_block);
 old_block:=$old$perform 1 from admin_development_private.grants g
   join admin_development_private.personas p on p.id=g.persona_id
   join portal_identity_private.staff_actors a on a.id=p.id and a.employee_principal_id=p.id and a.legacy_auth_id is null
   join portal_identity_private.principals principal on principal.id=p.id and principal.realm='employee' and principal.state='active'
   join public.admin_employees e on e.id=p.id and e.status='active'
   where g.credential_id=k.id and g.persona_id=p_persona and p.enabled
     and not exists(select 1 from auth.users where id=p.id)
     and not exists(select 1 from public.profiles where id=p.id)
     and not exists(select 1 from business_private.accounts where id=p.id)
   for share of g,p,a,principal,e;$old$;
 new_block:=$new$perform 1 from public.admin_employees e
   join portal_identity_private.principals principal on principal.id=e.id
   join portal_identity_private.identities identity on identity.principal_id=e.id and identity.realm='employee' and not identity.revoked
   join portal_identity_private.staff_actors a on a.id=e.id
   where e.id=p_persona and exists(select 1 from admin_development_private.employees_v2(k.id) allowed where allowed.id=e.id)
   for share of e,principal,identity,a;$new$;
 if position(old_block in changed)=0 then raise exception 'Selection definition drift';end if;
 changed:=replace(changed,old_block,new_block);
 old_block:='(select id from admin_development_private.personas where id=p_persona)';
 if position(old_block in changed)=0 then raise exception 'Audit definition drift';end if;
 changed:=replace(changed,old_block,'(select id from portal_identity_private.staff_actors where id=p_persona)');
 changed:=replace(changed,'All persona selection comes from private grants, never arbitrary member IDs.',
  'Employees own the directory; separate developer grants authorize impersonation.');
 execute changed;
 insert into admin_development_private.directory_restore values(signature,original,md5(pg_get_functiondef(signature::regprocedure)));

 signature:='admin_development_private.assurance_v1(text)';
 original:=pg_get_functiondef(signature::regprocedure);
 changed:=replace(original,E'\r\n',E'\n');
 old_block:=$old$join admin_development_private.grants g on g.credential_id=k.id and g.persona_id=c.persona_id
    join admin_development_private.personas p on p.id=c.persona_id$old$;
 if position(old_block in changed)=0 or position('and k.enabled and p.enabled and s.enabled' in changed)=0 then
  raise exception 'Assurance definition drift';end if;
 changed:=replace(changed,old_block,'join admin_development_private.employees_v2(k.id) p on p.id=c.persona_id');
 changed:=replace(changed,'and k.enabled and p.enabled and s.enabled','and k.enabled and s.enabled');
 execute changed;
 insert into admin_development_private.directory_restore values(signature,original,md5(pg_get_functiondef(signature::regprocedure)));
end$upgrade$;
commit;
