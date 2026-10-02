-- Portal-only candidate. Existing public/Auth/member functions are unchanged.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create table portal_identity_private.employee_contacts (
 id uuid primary key references portal_identity_private.staff_actors(id) on delete restrict,
 email text not null check(email=lower(btrim(email)) and length(email) between 3 and 254 and email !~ '[[:space:][:cntrl:]]' and position('@' in email)>1),
 verified_at timestamptz not null,
 updated_at timestamptz not null default clock_timestamp(),
 unique(email)
);
alter table portal_identity_private.employee_contacts enable row level security;
revoke all on portal_identity_private.employee_contacts from public,anon,authenticated,doji_employee,doji_business,service_role,doji_identity_resolver,doji_employee_application;
-- Contact data is operator-provisioned after exact WorkOS subject verification.
-- An email is a staff-directory lookup, never an identity binding or login grant.
create function portal_identity_private.employee_directory_v1() returns jsonb
language plpgsql security definer set search_path='' as $$begin
 if auth.jwt()->>'role' is distinct from 'doji_employee' or not public.admin_user_has_permission('admin.manage') then
  raise exception using errcode='42501',message='Employee super administrator required';end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
  'user_id',e.id,'username',c.email,'display_name',e.display_name,'avatar_url',null,
  'status',e.status,'roles',e.roles,'is_founder_admin',false,'is_banned',e.status='disabled',
  'last_changed_at',e.updated_at) order by e.created_at desc)
  from (select a.* from public.admin_employees a
    join portal_identity_private.employee_contacts contact on contact.id=a.id
    order by a.created_at desc limit 100) e
  join portal_identity_private.employee_contacts c on c.id=e.id),'[]'::jsonb));
end$$;
create function portal_identity_private.employee_role_command_v1(
 p_username text,p_role text,p_active boolean,p_reason text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare employee public.admin_employees%rowtype; before_state jsonb; after_state jsonb;
 previous public.admin_employee_access_events%rowtype;
begin
 if auth.jwt()->>'role' is distinct from 'doji_employee' or not public.admin_user_has_permission('admin.manage') then
  raise exception using errcode='42501',message='Employee super administrator required';end if;
 if p_role is null or p_role not in ('super_admin','operations','moderator','legal_reviewer','business_reviewer') or p_active is null then
  raise exception using errcode='22023',message='Choose an employee role and action';end if;
 if char_length(btrim(coalesce(p_reason,''))) not between 10 and 1000
  or char_length(btrim(coalesce(p_idempotency_key,''))) not between 12 and 160
  or length(btrim(coalesce(p_username,''))) not between 3 and 254 then
  raise exception using errcode='22023',message='Employee, reason and request ID required';end if;
 -- Same serialization key as the legacy role command during fallback.
 perform pg_advisory_xact_lock(92610001);
 select e.* into employee from public.admin_employees e
  join portal_identity_private.employee_contacts c on c.id=e.id
  join portal_identity_private.principals p on p.id=e.id and p.realm='employee'
  join portal_identity_private.identities i on i.principal_id=p.id and i.realm='employee'
  where c.email=lower(btrim(p_username)) and p.state='active' and not i.revoked
  for update of e;
 if not found then raise exception using errcode='42501',message='Verified mapped employee not found';end if;
 select * into previous from public.admin_employee_access_events where actor_id=auth.uid() and request_id=p_idempotency_key;
 if found then
  if previous.employee_id<>employee.id or previous.next_state->>'changed_role'<>p_role
   or (previous.next_state->>'granted')::boolean is distinct from p_active
   or previous.reason is distinct from btrim(p_reason) then
   raise exception using errcode='22023',message='Request ID already used';end if;
  return previous.next_state;
 end if;
 before_state:=jsonb_build_object('status',employee.status,'roles',employee.roles);
 if p_active then
  employee.roles:=array(select distinct r from unnest(employee.roles||array[p_role]) r order by r);
  employee.status:='active';
 else
  if p_role='super_admin' and 'super_admin'=any(employee.roles) and not exists(
   select 1 from public.admin_employees e join portal_identity_private.staff_actors s on s.id=e.id
    where e.id<>employee.id and e.status='active' and 'super_admin'=any(e.roles) and (
     exists(select 1 from portal_identity_private.principals p join portal_identity_private.identities i on i.principal_id=p.id
      where p.id=s.employee_principal_id and p.realm='employee' and p.state='active' and i.realm='employee' and not i.revoked)
     or exists(select 1 from auth.users u where u.id=s.legacy_auth_id and u.role='doji_employee' and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp())))) then
   raise exception using errcode='42501',message='At least one employee super administrator must remain';end if;
  employee.roles:=array_remove(employee.roles,p_role);
  if cardinality(employee.roles)=0 then employee.status:='disabled';end if;
 end if;
 update public.admin_employees set roles=employee.roles,status=employee.status,updated_at=clock_timestamp() where id=employee.id;
 after_state:=jsonb_build_object('status',employee.status,'roles',employee.roles,'changed_role',p_role,'granted',p_active);
 insert into public.admin_employee_access_events(actor_id,employee_id,action,reason,request_id,previous_state,next_state)
  values(auth.uid(),employee.id,'employee.access_changed',btrim(p_reason),p_idempotency_key,before_state,after_state);
 insert into public.admin_audit_log(actor_id,actor_role,action,entity_type,entity_id,reason,request_id,metadata)
  values(auth.uid(),'super_admin','employee.access_changed','employee',employee.id::text,btrim(p_reason),p_idempotency_key,jsonb_build_object('before',before_state,'after',after_state));
 perform public.enqueue_domain_event('moderation:global','moderation.employee.access_changed',employee.id,jsonb_build_object('version',1,'employeeId',employee.id),null);
 return after_state;
end$$;
revoke all on function portal_identity_private.employee_directory_v1(),
 portal_identity_private.employee_role_command_v1(text,text,boolean,text,text)
 from public,anon,authenticated,doji_employee,doji_business,service_role,doji_identity_resolver,doji_employee_application;
-- Reachable only via the fixed identity-resolving employee bridge, not directly.
commit;
