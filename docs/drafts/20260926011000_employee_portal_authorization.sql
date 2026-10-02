-- DRAFT: NOT DEPLOYABLE. Scope approved; full-schema and hosted Auth tests pending.
-- Portal-only authorization migration. Does not grant the employee DB role any
-- member RPC/table access, change member RLS, or alter the Auth signup hook.
begin;
set local lock_timeout = '3s';
-- Requires the separately released deletion repair. Do not make a historical
-- actor's member account undeletable again when moving actor FKs to Auth.
do $$ begin
  if to_regclass('public.admin_deleted_member_references') is null then
    raise exception 'Account deletion repair must be installed first';
  end if;
end $$;
create table public.admin_employee_cutover (
  singleton boolean primary key default true check(singleton),
  employee_only boolean not null default false
);
insert into public.admin_employee_cutover values(true,false);
alter table public.admin_employee_cutover enable row level security;
revoke all on public.admin_employee_cutover from public,anon,authenticated,doji_employee;

alter function public.admin_user_has_permission(text) rename to legacy_admin_user_has_permission_20260926;
revoke all on function public.legacy_admin_user_has_permission_20260926(text) from public,anon,authenticated,doji_employee;
create function public.admin_user_has_permission(p_permission text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare staff public.admin_employees%rowtype;
begin
  if auth.jwt()->>'role' is distinct from 'doji_employee' then
    if (select employee_only from public.admin_employee_cutover where singleton) then return false; end if;
    return public.legacy_admin_user_has_permission_20260926(p_permission);
  end if;
  if auth.jwt()->>'aal' is distinct from 'aal2' then return false; end if;
  select * into staff from public.admin_employees where id=auth.uid() and status='active';
  if not found then return false; end if;
  return 'super_admin'=any(staff.roles) or
    (p_permission='portal.session' and cardinality(staff.roles)>0) or
    (p_permission='operations.read' and 'operations'=any(staff.roles)) or
    (p_permission in ('moderation.read','moderation.write') and staff.roles && array['operations','moderator']) or
    (p_permission='legal.read' and staff.roles && array['operations','legal_reviewer']) or
    (p_permission='business.read' and staff.roles && array['operations','business_reviewer']);
end;
$$;
revoke all on function public.admin_user_has_permission(text) from public,anon;
grant execute on function public.admin_user_has_permission(text) to authenticated,doji_employee;

alter function public.admin_current_operator_role() rename to legacy_admin_current_operator_role_20260926;
create function public.admin_current_operator_role()
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.jwt()->>'role'='doji_employee' then
    return (select r from public.admin_employees e, unnest(e.roles) r where e.id=auth.uid() and e.status='active'
      order by array_position(array['super_admin','operations','moderator','legal_reviewer','business_reviewer'],r) limit 1);
  end if;
  return public.legacy_admin_current_operator_role_20260926();
end;
$$;
revoke all on function public.admin_current_operator_role() from public,anon,authenticated,doji_employee;

-- Staff actors are Auth identities, not social profiles. Existing actor UUIDs
-- remain untouched and retain their historical identity. Targets stay members.
do $$
declare item record; constraint_row record;
begin
  for item in select * from (values
    ('admin_audit_log','actor_id','SET NULL'),
    ('admin_report_triage','assigned_to','SET NULL'),
    ('admin_report_triage','resolved_by','SET NULL'),
    ('moderation_decisions','decided_by','SET NULL'),
    ('moderation_decisions','reversed_by','SET NULL'),
    ('moderation_appeals','reviewed_by','SET NULL')
  ) as refs(table_name,column_name,on_delete) loop
    execute format('alter table public.%I alter column %I drop not null',item.table_name,item.column_name);
    for constraint_row in select c.conname from pg_catalog.pg_constraint c
      join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
      where c.conrelid=format('public.%I',item.table_name)::regclass and c.contype='f'
        and a.attname=item.column_name and c.confrelid='public.profiles'::regclass
    loop
      execute format('alter table public.%I drop constraint %I',item.table_name,constraint_row.conname);
    end loop;
    execute format('alter table public.%I add constraint %I foreign key (%I) references auth.users(id) on delete %s',
      item.table_name,item.table_name||'_'||item.column_name||'_employee_fkey',item.column_name,item.on_delete);
  end loop;
end;
$$;

alter table public.admin_report_triage add column if not exists deleted_member_refs jsonb not null default '{}';
create index if not exists admin_triage_assignee_deletion_idx on public.admin_report_triage(assigned_to);
create index if not exists admin_triage_resolver_deletion_idx on public.admin_report_triage(resolved_by);

-- Auth FKs can be cleared before the profile cascade runs. Capture actor UUIDs
-- at the parent BEFORE DELETE boundary, independent of FK-trigger ordering.
-- Only attribution is added: prior action/reason/metadata and outcomes survive.
create function public.retain_deleted_admin_actor_history_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
declare item record; affected integer; retained boolean := false;
begin
  for item in select * from (values
    ('admin_audit_log','actor_id'),('admin_report_triage','assigned_to'),
    ('admin_report_triage','resolved_by'),('moderation_decisions','decided_by'),
    ('moderation_decisions','reversed_by'),('moderation_appeals','reviewed_by')
  ) refs(table_name,column_name) loop
    -- Detach in this BEFORE trigger, not later in Auth's SET NULL triggers:
    -- the profile cascade also updates history rows and can recheck an actor FK
    -- after the Auth parent is gone but before its FK trigger has run.
    execute format('update public.%I set deleted_member_refs=deleted_member_refs || jsonb_build_object(%L,$1::text), %I=null where %I=$1',
      item.table_name,item.column_name,item.column_name,item.column_name) using old.id;
    get diagnostics affected = row_count;
    retained := retained or affected > 0;
  end loop;
  if retained then
    insert into public.admin_deleted_member_references(member_id) values(old.id) on conflict do nothing;
  end if;
  return old;
end;
$$;
revoke all on function public.retain_deleted_admin_actor_history_v1() from public,anon,authenticated,doji_employee;
create trigger retain_deleted_admin_actor_history before delete on auth.users
  for each row execute function public.retain_deleted_admin_actor_history_v1();

create view public.admin_actor_directory as
  select id,username,display_name,avatar_url from public.profiles
  union all
  select id,'employee-'||left(id::text,8),display_name,null::text from public.admin_employees;
revoke all on public.admin_actor_directory from public,anon,authenticated,doji_employee;
-- Only operator identity joins in existing portal read functions are changed.
-- Never replace reported-member, reporter, submitter or content-author joins.
do $$
declare item record; rewritten text;
begin
  for item in select p.oid,pg_catalog.pg_get_functiondef(p.oid) as definition
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'get_admin_%' and p.prokind='f'
  loop
    rewritten := regexp_replace(item.definition,
      'join public[.]profiles (owner|actor|viewer|resolver|decider) on',
      'join public.admin_actor_directory \1 on','g');
    rewritten := replace(rewritten,'join public.profiles profile on profile.id = audit.actor_id',
      'join public.admin_actor_directory profile on profile.id = audit.actor_id');
    if rewritten <> item.definition then execute rewritten; end if;
  end loop;
end;
$$;

alter function public.get_admin_portal_session() rename to legacy_admin_portal_session_20260926;
revoke all on function public.legacy_admin_portal_session_20260926() from public,anon,authenticated,doji_employee;
create function public.get_admin_portal_session()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare employee public.admin_employees%rowtype;
begin
  if auth.jwt()->>'role' is distinct from 'doji_employee' then
    if (select employee_only from public.admin_employee_cutover where singleton) then
      raise exception 'Employee account required' using errcode='42501'; end if;
    return public.legacy_admin_portal_session_20260926();
  end if;
  if not public.admin_user_has_permission('portal.session') then raise exception 'Approved employee and MFA required' using errcode='42501'; end if;
  select * into employee from public.admin_employees where id=auth.uid();
  return jsonb_build_object('user_id',employee.id,'username','employee-'||left(employee.id::text,8),
    'display_name',employee.display_name,'avatar_url',null,'roles',to_jsonb(employee.roles),
    'account_type','employee','aal',auth.jwt()->>'aal','read_only',false,'server_time',clock_timestamp());
end;
$$;
revoke all on function public.get_admin_portal_session() from public,anon;
grant execute on function public.get_admin_portal_session() to authenticated,doji_employee;

create function public.get_admin_employee_directory_v1()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.jwt()->>'role' is distinct from 'doji_employee' or not public.admin_user_has_permission('admin.manage') then
    raise exception 'Employee super administrator required' using errcode='42501'; end if;
  return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
    'user_id',e.id,'username',u.email,'display_name',e.display_name,'avatar_url',null,
    'status',e.status,'roles',e.roles,'is_founder_admin',false,'is_banned',e.status='disabled',
    'last_changed_at',e.updated_at) order by e.created_at desc)
    from (select * from public.admin_employees order by created_at desc limit 100) e
    join auth.users u on u.id=e.id),'[]'::jsonb));
end;
$$;

create function public.admin_set_employee_role_v1(p_username text,p_role text,p_active boolean,p_reason text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare employee public.admin_employees%rowtype; before_state jsonb; after_state jsonb; previous public.admin_employee_access_events%rowtype;
begin
  if auth.jwt()->>'role' is distinct from 'doji_employee' or not public.admin_user_has_permission('admin.manage') then
    raise exception 'Employee super administrator required' using errcode='42501'; end if;
  if p_role is null or p_role not in ('super_admin','operations','moderator','legal_reviewer','business_reviewer')
    or p_active is null then raise exception 'Choose an employee role and action'; end if;
  if char_length(btrim(coalesce(p_reason,''))) not between 10 and 1000
    or char_length(btrim(coalesce(p_idempotency_key,''))) not between 12 and 160 then raise exception 'Reason and request ID required'; end if;
  -- Serialize access changes, including last-super-admin protection and replays.
  perform pg_catalog.pg_advisory_xact_lock(92610001);
  select e.* into employee from public.admin_employees e join auth.users u on u.id=e.id
    where lower(u.email)=lower(btrim(p_username)) and u.role='doji_employee' and u.email_confirmed_at is not null for update of e;
  if not found then raise exception 'Verified employee not found'; end if;
  select * into previous from public.admin_employee_access_events where actor_id=auth.uid() and request_id=p_idempotency_key;
  if found then
    if previous.employee_id<>employee.id or previous.next_state->>'changed_role'<>p_role
       or (previous.next_state->>'granted')::boolean is distinct from p_active
       or previous.reason is distinct from btrim(p_reason) then raise exception 'Request ID already used'; end if;
    return previous.next_state;
  end if;
  before_state:=jsonb_build_object('status',employee.status,'roles',employee.roles);
  if p_active then
    employee.roles:=array(select distinct r from unnest(employee.roles||array[p_role]) r order by r);
    employee.status:='active';
  else
    if p_role='super_admin' and 'super_admin'=any(employee.roles) and not exists(
      select 1 from public.admin_employees where id<>employee.id and status='active' and 'super_admin'=any(roles)) then
      raise exception 'At least one employee super administrator must remain'; end if;
    employee.roles:=array_remove(employee.roles,p_role);
    if cardinality(employee.roles)=0 then employee.status:='disabled'; end if;
  end if;
  update public.admin_employees set roles=employee.roles,status=employee.status,updated_at=clock_timestamp() where id=employee.id;
  after_state:=jsonb_build_object('status',employee.status,'roles',employee.roles,'changed_role',p_role,'granted',p_active);
  insert into public.admin_employee_access_events(actor_id,employee_id,action,reason,request_id,previous_state,next_state)
    values(auth.uid(),employee.id,'employee.access_changed',btrim(p_reason),p_idempotency_key,before_state,after_state);
  insert into public.admin_audit_log(actor_id,actor_role,action,entity_type,entity_id,reason,request_id,metadata)
    values(auth.uid(),'super_admin','employee.access_changed','employee',employee.id::text,btrim(p_reason),
      p_idempotency_key,jsonb_build_object('before',before_state,'after',after_state));
  perform public.enqueue_domain_event('moderation:global','moderation.employee.access_changed',employee.id,
    jsonb_build_object('version',1,'employeeId',employee.id),null);
  return after_state;
end;
$$;
revoke all on function public.get_admin_employee_directory_v1(), public.admin_set_employee_role_v1(text,text,boolean,text,text) from public,anon,authenticated;
grant execute on function public.get_admin_employee_directory_v1(), public.admin_set_employee_role_v1(text,text,boolean,text,text) to doji_employee;

-- Exact allowlist, not ALL FUNCTIONS. Internal helpers stay uncallable.
do $$
declare item record;
begin
  for item in select p.oid::regprocedure as signature from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array[
      'get_admin_portal_session_v3','get_admin_command_center_snapshot_v2','get_admin_report_case_v2',
      'get_admin_work_queue_page_v1','get_admin_resolved_reports_page_v1','get_admin_audit_page_v2',
      'get_admin_audit_export_v1','get_admin_event_health_history_v1','get_admin_operational_health_read_v1',
      'get_admin_appeals_snapshot','get_admin_realtime_token_capabilities',
      'admin_triage_report','admin_set_report_review_state_v1','admin_decide_report_v3','admin_review_moderation_appeal'])
  loop execute format('grant execute on function %s to doji_employee',item.signature); end loop;
end;
$$;

-- BEGIN EMPLOYEE COMMAND RECEIPTS
-- Member command_receipts has a profiles FK. Keep that table, grants and member
-- commands untouched; employee administrative commands need their own ledger.
create table public.admin_employee_command_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(user_id,idempotency_key)
);
alter table public.admin_employee_command_receipts enable row level security;
revoke all on public.admin_employee_command_receipts from public,anon,authenticated,doji_employee;
create view public.admin_portal_command_receipts as
  select * from public.command_receipts where auth.jwt()->>'role' is distinct from 'doji_employee'
  union all
  select * from public.admin_employee_command_receipts where auth.jwt()->>'role'='doji_employee';
revoke all on public.admin_portal_command_receipts from public,anon,authenticated,doji_employee;
create function public.route_admin_command_receipt_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_table text;
begin
  if new.user_id is distinct from auth.uid() then raise exception 'Receipt actor must match caller'; end if;
  target_table:=case when auth.jwt()->>'role'='doji_employee'
    then 'admin_employee_command_receipts' else 'command_receipts' end;
  if tg_op='INSERT' then
    new.created_at:=coalesce(new.created_at,clock_timestamp());
    execute format('insert into public.%I(user_id,idempotency_key,result,created_at) values($1,$2,$3,$4)',target_table)
      using new.user_id,new.idempotency_key,new.result,new.created_at;
  elsif tg_op='UPDATE' then
    if new.user_id is distinct from old.user_id or new.idempotency_key is distinct from old.idempotency_key then
      raise exception 'Receipt identity is immutable'; end if;
    execute format('update public.%I set result=$3 where user_id=$1 and idempotency_key=$2',target_table)
      using old.user_id,old.idempotency_key,new.result;
  end if;
  return new;
end;
$$;
revoke all on function public.route_admin_command_receipt_v1() from public,anon,authenticated,doji_employee;
create trigger route_admin_command_receipt instead of insert or update on public.admin_portal_command_receipts
  for each row execute function public.route_admin_command_receipt_v1();
-- Explicit portal-only command inventory, including delegated legacy bodies.
-- Existing advisory locks, idempotency keys, receipts and atomicity are retained.
do $$
declare item record; rewritten text;
begin
  for item in select pg_get_functiondef(p.oid) definition from pg_proc p
    where p.pronamespace='public'::regnamespace and p.proname=any(array[
      'admin_decide_report_v2_legacy_20260924','admin_decide_report_v3',
      'admin_review_moderation_appeal_before_account_restrictions_2026',
      'admin_set_report_review_state_v1','admin_triage_report_before_restricted_guard_20260924'])
  loop
    rewritten:=replace(item.definition,'public.command_receipts','public.admin_portal_command_receipts');
    if rewritten<>item.definition then execute rewritten; end if;
  end loop;
end;
$$;
-- END EMPLOYEE COMMAND RECEIPTS

-- Employee evidence access has its own Storage policy; member policies/grants
-- are unchanged. No employee upload, update or delete privilege is granted.
grant usage on schema storage to doji_employee;
grant select on storage.objects to doji_employee;
-- Bind the viewer server-side. Do not expose the shared helper's arbitrary
-- viewer parameter or require employee USAGE on the managed Auth schema.
create function public.employee_can_read_report_evidence_v1(p_object_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.jwt()->>'role'='doji_employee'
    and public.admin_user_has_permission('moderation.read')
    and exists (
      select 1 from public.reports report
      join public.posts post on post.id=report.post_id
      left join public.admin_report_triage triage on triage.report_id=report.id
      where report.status in ('pending','dismissed','actioned')
        and (coalesce(triage.queue,'moderation')='moderation'
          or (triage.queue='restricted_safety' and public.admin_user_has_permission('legal.read')))
        and (public.public_storage_object_path(post.photo_url,'post-media')=p_object_path
          or public.public_storage_object_path(post.front_photo_url,'post-media')=p_object_path
          or public.public_storage_object_path(post.video_url,'post-media')=p_object_path)
    );
$$;
revoke all on function public.employee_can_read_report_evidence_v1(text) from public,anon,authenticated;
grant execute on function public.employee_can_read_report_evidence_v1(text) to doji_employee;
create policy employee_report_evidence_read on storage.objects for select to doji_employee
  using (bucket_id='post-media' and public.employee_can_read_report_evidence_v1(name));
-- Existing PUBLIC Storage policies are shared infrastructure. Restrict only the
-- employee role so permissive PUBLIC policies cannot broaden evidence access.
create policy employee_report_evidence_boundary on storage.objects as restrictive for select to doji_employee
  using (bucket_id='post-media' and public.employee_can_read_report_evidence_v1(name));

-- No client can turn off the migration gate. Enable only after all live checks
-- and the owner MFA test; this leaves legacy records intact for rollback.
create function public.activate_employee_portal_v1()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(92610001);
  if not exists(select 1 from public.admin_employees e join auth.mfa_factors f on f.user_id=e.id
    where e.status='active' and 'super_admin'=any(e.roles) and f.status='verified') then
    raise exception 'An active employee super administrator with verified MFA is required'; end if;
  update public.admin_employee_cutover set employee_only=true where singleton;
end;
$$;
revoke all on function public.activate_employee_portal_v1() from public,anon,authenticated,doji_employee;
grant execute on function public.activate_employee_portal_v1() to service_role;

-- BEGIN EMPLOYEE MODERATION RATE LIMITS
-- Owner-approved shared-trigger dispatch. The member helper, ledger, limits and
-- caller identity are unchanged. Two bounded buckets per employee, not a second
-- member profile or an unbounded history requiring a new maintenance job.
create table public.admin_employee_rate_limits (
  employee_id uuid not null references public.admin_employees(id) on delete cascade,
  action text not null check (action in ('comment','poll_vote')),
  bucket_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key(employee_id,action)
);
alter table public.admin_employee_rate_limits enable row level security;
revoke all on public.admin_employee_rate_limits from public,anon,authenticated,doji_employee;
create function public.enforce_employee_moderation_rate_limit_v1(p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); bucket_start timestamptz; observed_count integer; request_limit integer;
begin
  if auth.jwt()->>'role' is distinct from 'doji_employee'
    or auth.jwt()->>'aal' is distinct from 'aal2'
    or not public.admin_user_has_permission('moderation.write') then
    raise exception 'Approved employee moderator and MFA required' using errcode='42501';
  end if;
  request_limit := case p_action when 'comment' then 30 when 'poll_vote' then 10 end;
  if request_limit is null then raise exception 'Invalid employee moderation budget'; end if;
  bucket_start := to_timestamp(floor(extract(epoch from clock_timestamp()) / 60) * 60);
  insert into public.admin_employee_rate_limits(employee_id,action,bucket_started_at,request_count)
    values(uid,p_action,bucket_start,1)
    on conflict(employee_id,action) do update set
      request_count=case when admin_employee_rate_limits.bucket_started_at=excluded.bucket_started_at
        then admin_employee_rate_limits.request_count+1 else 1 end,
      bucket_started_at=excluded.bucket_started_at
    returning request_count into observed_count;
  if observed_count > request_limit then
    raise exception using errcode='P0001', message='Too many moderation actions. Please wait a moment and try again.',
      detail='employee_rate_limited:'||p_action,
      hint='retry_after_seconds='||greatest(1,ceil(extract(epoch from bucket_start+interval '60 seconds'-clock_timestamp()))::integer)::text;
  end if;
end;
$$;
revoke all on function public.enforce_employee_moderation_rate_limit_v1(text) from public,anon,authenticated,doji_employee;
create or replace function public.trg_enforce_write_rate_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.jwt()->>'role'='doji_employee' then
    -- Employee table writes remain denied. Only existing audited moderation RPCs
    -- can reach this branch; allow status-only updates on these two exact tables.
    if tg_table_schema<>'public' or tg_table_name not in ('comments','poll_votes')
      or tg_op<>'UPDATE' then
      raise exception 'Employee write outside moderation boundary' using errcode='42501';
    end if;
    if (to_jsonb(new)-'moderation_status') is distinct from (to_jsonb(old)-'moderation_status') then
      raise exception 'Employee moderation may only change content visibility' using errcode='42501';
    end if;
    perform public.enforce_employee_moderation_rate_limit_v1(
      case tg_table_name when 'comments' then 'comment' else 'poll_vote' end);
  else
    perform public.enforce_api_rate_limit(
      tg_argv[0],tg_argv[1]::integer,coalesce(nullif(tg_argv[2], '')::integer,60));
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
-- END EMPLOYEE MODERATION RATE LIMITS

-- Fail closed on legacy PUBLIC/default grants. NOINHERIT does not remove PUBLIC
-- privileges. Never silently revoke a shared member grant to make this pass.
do $$
declare exposed text;
begin
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) into exposed
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f'
    and not exists(select 1 from pg_catalog.pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
    and has_function_privilege('doji_employee',p.oid,'EXECUTE')
    and p.proname <> all(array[
      'get_employee_registration_status_v1','admin_user_has_permission','get_admin_portal_session',
      'get_admin_employee_directory_v1','admin_set_employee_role_v1','employee_can_read_report_evidence_v1',
      'get_admin_portal_session_v3','get_admin_command_center_snapshot_v2','get_admin_report_case_v2',
      'get_admin_work_queue_page_v1','get_admin_resolved_reports_page_v1','get_admin_audit_page_v2',
      'get_admin_audit_export_v1','get_admin_event_health_history_v1','get_admin_operational_health_read_v1',
      'get_admin_appeals_snapshot','get_admin_realtime_token_capabilities','admin_triage_report',
      'admin_set_report_review_state_v1','admin_decide_report_v3','admin_review_moderation_appeal'])
    -- Reviewed September 26 against the production schema-only export. These
    -- existing PUBLIC helpers are argument-only immutable calculators or
    -- SECURITY INVOKER trigger functions (not callable as ordinary RPCs).
    -- Employees have no member-table or TRIGGER grants. Preserve member grants;
    -- any body/signature/security/return-type change requires another review.
    and not exists (
      select 1 from (values
        ('level_from_xp(integer)','38926c89498cd4a777f07c619f76839f','integer','i'),
        ('shields_for_level(integer)','471825f64f24c04e36bf7d99387b4920','integer','i'),
        ('sparks_for_badge_tier(text)','2d9e9736db15346df8b18513ff2d1147','integer','i'),
        ('sparks_for_level(integer)','05c86e4d237bfefe02e645a52e5e8fc7','integer','i'),
        ('sparks_for_xp(integer)','1e41fe5ac4224300576b72b7f01f9f4a','integer','i'),
        ('comments_enforce_parent()','58832d4c0193e9ec5f028865724becd5','trigger','v'),
        ('touch_friendship_accepted_at()','11100be9f2fa8d9b1e6d525573703d74','trigger','v'),
        ('trg_award_streak_shields()','52addff1cfceaa19c0706905a48ea509','trigger','v'),
        ('trg_poll_vote_custom_text()','39b55951bd504f4586ea0cc4552b3a1e','trigger','v'),
        ('trg_profile_xp_level()','3cb143245e6f3ec95db10990217b5788','trigger','v'),
        ('update_updated_at()','204b9b9355e61b7541bc0633bbc9294c','trigger','v'),
        ('validate_format_post_caption()','4a6ddbf25ca687fd0257dcb6868a9d25','trigger','v')
      ) reviewed(signature,source_hash,return_type,volatility)
      where p.oid=to_regprocedure('public.'||reviewed.signature)
        and md5(p.prosrc)=reviewed.source_hash and not p.prosecdef
        and p.prorettype=to_regtype(reviewed.return_type)
        and p.provolatile::text=reviewed.volatility
        and p.prolang in (select oid from pg_catalog.pg_language where lanname in ('sql','plpgsql'))
    );
  if exposed is not null then raise exception 'Employee isolation preflight: unexpected RPC access: %', exposed; end if;
  select string_agg(c.oid::regclass::text, ', ') into exposed
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','v','m','p')
    and has_table_privilege('doji_employee',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
  if exposed is not null then raise exception 'Employee isolation preflight: unexpected table access: %', exposed; end if;
end;
$$;
commit;
