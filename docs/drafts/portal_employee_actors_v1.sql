-- Owner-approved staff-reference migration. Does not migrate member identities,
-- rewrite historical actor UUIDs, change public RPCs or enable WorkOS login.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';

create table portal_identity_private.staff_actors (
 id uuid primary key,
 legacy_auth_id uuid unique references auth.users(id) on delete cascade,
 employee_principal_id uuid unique,
 employee_realm text not null default 'employee' check(employee_realm='employee'),
 foreign key(employee_principal_id,employee_realm)
  references portal_identity_private.principals(id,realm) on delete restrict,
 check((legacy_auth_id is not null and legacy_auth_id=id and employee_principal_id is null)
  or (legacy_auth_id is null and employee_principal_id is not null and employee_principal_id=id))
);
-- This is an attribution registry, not an account or permission grant. Legacy
-- actors retain their existing Auth deletion behavior. External employees have
-- no Auth/member row; their history survives provider account closure.
create table portal_identity_private.staff_reference_migration (
 relation_name text not null,
 column_name text not null,
 constraint_name text not null,
 deletion_action text not null check(deletion_action in('SET NULL','CASCADE','RESTRICT')),
 original_definition text not null,
 primary key(relation_name,column_name)
);
alter table portal_identity_private.staff_actors enable row level security;
alter table portal_identity_private.staff_reference_migration enable row level security;
revoke all on portal_identity_private.staff_actors,portal_identity_private.staff_reference_migration
 from public,anon,authenticated,doji_employee,doji_business,service_role,doji_identity_resolver;

do $$declare r record; actual record; rel regclass; expected text; begin
 for r in select * from (values
  ('admin_employees','id','admin_employees_id_fkey','RESTRICT'),
  ('admin_employee_access_events','actor_id','admin_employee_access_events_actor_id_fkey','RESTRICT'),
  ('admin_employee_command_receipts','user_id','admin_employee_command_receipts_user_id_fkey','CASCADE'),
  ('admin_audit_log','actor_id','admin_audit_log_actor_id_employee_fkey','SET NULL'),
  ('admin_report_triage','assigned_to','admin_report_triage_assigned_to_employee_fkey','SET NULL'),
  ('admin_report_triage','resolved_by','admin_report_triage_resolved_by_employee_fkey','SET NULL'),
  ('moderation_decisions','decided_by','moderation_decisions_decided_by_employee_fkey','SET NULL'),
  ('moderation_decisions','reversed_by','moderation_decisions_reversed_by_employee_fkey','SET NULL'),
  ('moderation_appeals','reviewed_by','moderation_appeals_reviewed_by_employee_fkey','SET NULL')
 ) refs(relation_name,column_name,constraint_name,deletion_action) loop
  rel:=format('public.%I',r.relation_name)::regclass;
  -- Prevent attribution writes between backfill and constraint replacement.
  -- Short lock timeout aborts the entire transaction rather than waiting behind users.
  execute format('lock table %s in access exclusive mode',rel);
  expected:=format('FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE %s',r.column_name,r.deletion_action);
  select c.*,pg_get_constraintdef(c.oid) as definition into actual from pg_constraint c
   where c.conrelid=rel and c.conname=r.constraint_name;
  if not found or actual.contype<>'f' or actual.confrelid<>'auth.users'::regclass
   or not actual.convalidated or actual.condeferrable or actual.definition<>expected then
   raise exception 'Unreviewed staff reference: %.%',r.relation_name,r.column_name;end if;
  insert into portal_identity_private.staff_reference_migration
   values(r.relation_name,r.column_name,r.constraint_name,r.deletion_action,actual.definition);
  execute format('insert into portal_identity_private.staff_actors(id,legacy_auth_id)
   select distinct %1$I,%1$I from %2$s where %1$I is not null on conflict(id) do nothing',r.column_name,rel);
 end loop;
 -- Existing UUIDs and action/reason/metadata rows are never updated here.
 for r in select * from portal_identity_private.staff_reference_migration order by relation_name,column_name loop
  execute format('alter table public.%I drop constraint %I',r.relation_name,r.constraint_name);
  execute format('alter table public.%I add constraint %I foreign key (%I)
   references portal_identity_private.staff_actors(id) on delete %s',
   r.relation_name,r.constraint_name,r.column_name,r.deletion_action);
 end loop;
end$$;

-- Preserve legacy portal registration/commands during rollout and fallback.
-- Called only by triggers on the seven exact staff-reference relations. A valid
-- existing Auth FK target may gain an attribution row, never employee privileges.
create function portal_identity_private.ensure_staff_attribution_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare r record; actor uuid; columns_seen integer:=0;
begin
 if tg_table_schema<>'public' or tg_op not in('INSERT','UPDATE') or tg_nargs<>0 then
  raise exception using errcode='42501',message='Invalid staff attribution trigger';end if;
 for r in select column_name from portal_identity_private.staff_reference_migration
  where relation_name=tg_table_name loop
  columns_seen:=columns_seen+1;
  actor:=(to_jsonb(new)->>r.column_name)::uuid;
  if actor is not null and not exists(select 1 from portal_identity_private.staff_actors where id=actor) then
   insert into portal_identity_private.staff_actors(id,legacy_auth_id)
    select id,id from auth.users where id=actor on conflict(id) do nothing;
   if not exists(select 1 from portal_identity_private.staff_actors where id=actor) then
    raise exception using errcode='23503',message='Unknown staff attribution';end if;
  end if;
 end loop;
 if columns_seen=0 then raise exception using errcode='42501',message='Unreviewed staff relation';end if;
 return new;
end$$;
revoke all on function portal_identity_private.ensure_staff_attribution_v1()
 from public,anon,authenticated,doji_employee,doji_business,service_role,doji_identity_resolver;
do $$declare r record;begin
 for r in select distinct relation_name from portal_identity_private.staff_reference_migration loop
  execute format('create trigger ensure_staff_attribution_v1 before insert or update on public.%I
   for each row execute function portal_identity_private.ensure_staff_attribution_v1()',r.relation_name);
 end loop;
end$$;

-- Explicit operator provisioning only. Does not bind by email, create an Auth
-- account, activate a principal or grant a role. Existing employee UUIDs may be
-- retained after their exact provider-subject mapping has been independently verified.
create function portal_identity_private.prepare_employee_actor_v1(p_id uuid,p_reference text)
returns uuid language plpgsql security definer set search_path='' as $$
declare prior portal_identity_private.staff_actors%rowtype;
begin
 if p_id is null or p_reference is null or length(btrim(p_reference)) not between 10 and 160 then
  raise exception using errcode='22023',message='Explicit employee review required';end if;
 perform 1 from portal_identity_private.principals where id=p_id and realm='employee' and state in('pending','active') for update;
 if not found or not exists(select 1 from portal_identity_private.identities where principal_id=p_id and realm='employee' and not revoked)
  or exists(select 1 from public.profiles where id=p_id)
  or exists(select 1 from business_private.accounts where id=p_id) then
  raise exception using errcode='42501',message='Separate mapped employee required';end if;
 select * into prior from portal_identity_private.staff_actors where id=p_id for update;
 if found and prior.employee_principal_id=p_id then return p_id;end if;
 if exists(select 1 from auth.users where id=p_id and
  (role is distinct from 'doji_employee' or raw_app_meta_data->>'account_type' is distinct from 'employee'
   or deleted_at is not null or banned_until>clock_timestamp())) then
  raise exception using errcode='42501',message='Wrong legacy account realm';end if;
 insert into portal_identity_private.staff_actors(id,employee_principal_id) values(p_id,p_id)
  on conflict(id) do update set legacy_auth_id=null,employee_principal_id=excluded.employee_principal_id;
 insert into portal_identity_private.mapping_audit(principal_id,action,review_reference)
  values(p_id,'employee.actor_prepared',btrim(p_reference));
 return p_id;
end$$;
revoke all on function portal_identity_private.prepare_employee_actor_v1(uuid,text)
 from public,anon,authenticated,doji_employee,doji_business,service_role,doji_identity_resolver;

-- No managed Auth trigger, member FK, public RPC, RLS policy or permission changes.
-- Retain legacy Auth rows during rollout; provider/session cutover is separate.
commit;
