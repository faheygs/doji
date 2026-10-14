-- LOCAL PREPARATION ONLY. Not an automatic migration or an approved release.
-- Adds ownership to the two queues with no existing ownership store. Existing
-- report/takedown ownership and every domain decision command remain unchanged.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create schema staff_workflow_private;
revoke all on schema staff_workflow_private from public,anon,authenticated,doji_employee,service_role;
create table staff_workflow_private.settings (
 singleton boolean primary key check(singleton), enabled boolean not null default false
);
insert into staff_workflow_private.settings values(true,false);
create table staff_workflow_private.ownership (
 kind text not null check(kind in ('suggestion','business_application')),
 case_id uuid not null,
 assigned_to uuid,
 revision bigint not null default 0 check(revision>=0),
 updated_at timestamptz not null default clock_timestamp(),
 primary key(kind,case_id)
);
-- Actor UUIDs are retained attribution, not grants and not member/Auth FKs.
-- Every command checks the current active employee row and source permissions.
create index staff_ownership_mine_idx on staff_workflow_private.ownership(assigned_to,kind,case_id)
 where assigned_to is not null;
-- Local-only index candidate; assess production size/lock budget separately.
create index staff_business_pending_page_idx on business_private.applications(created_at,id)
 where state='pending';
create table staff_workflow_private.history (
 kind text not null, case_id uuid not null, revision bigint not null,
 actor_id uuid not null, prior_owner uuid, next_owner uuid,
 action text not null check(action in ('claim','release','assign')),
 occurred_at timestamptz not null default clock_timestamp(),
 primary key(kind,case_id,revision)
);
create table staff_workflow_private.receipts (
 actor_id uuid not null, request_id uuid not null, fingerprint text not null,
 outcome jsonb not null, primary key(actor_id,request_id)
);
alter table staff_workflow_private.settings enable row level security;
alter table staff_workflow_private.ownership enable row level security;
alter table staff_workflow_private.history enable row level security;
alter table staff_workflow_private.receipts enable row level security;
revoke all on all tables in schema staff_workflow_private from public,anon,authenticated,doji_employee,service_role;

create function staff_workflow_private.authorize(p_kind text) returns void
language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or auth.jwt()->>'role' is distinct from 'doji_employee'
  or auth.jwt()->>'aal' is distinct from 'aal2' then
  raise exception using errcode='42501',message='Employee MFA required'; end if;
 if not exists(select 1 from staff_workflow_private.settings where singleton and enabled) then
  raise exception using errcode='55000',message='Staff ownership is not enabled'; end if;
 if p_kind='suggestion' then perform public.admin_editorial_authorize_v1(false);
 elsif p_kind='business_application' then perform business_private.staff_actor(false);
 else raise exception using errcode='22023',message='Unsupported ownership queue'; end if;
end$$;

create function staff_workflow_private.source(p_kind text,p_id uuid,p_lock boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; account_id uuid;
begin
 -- No request bodies, allegations, contact details or unsent business drafts.
 if p_kind='suggestion' then
  if p_lock then perform 1 from public.challenge_suggestions where id=p_id for update; end if;
  select jsonb_build_object('state',s.status,'source_version',md5(to_jsonb(s)::text),
   'actionable',s.status='pending') into result from public.challenge_suggestions s where id=p_id;
 elsif p_kind='business_application' then
  if p_lock then
   select applicant_id into account_id from business_private.applications where id=p_id;
   -- Same lock order as the application/review/privacy commands.
   perform 1 from business_private.accounts where id=account_id for update;
   perform 1 from business_private.applications where id=p_id for update;
  end if;
  select jsonb_build_object('state',state,'source_version',revision::text,
   'actionable',state='pending') into result from business_private.applications where id=p_id;
 else raise exception using errcode='22023',message='Unsupported ownership queue'; end if;
 if result is null then raise exception using errcode='P0002',message='Work item unavailable'; end if;
 return result;
end$$;

-- One eligibility predicate is shared by the read, picker and locked command.
create function staff_workflow_private.eligible(p_kind text,p_id uuid,p_employee uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.admin_employees e where e.id=p_employee and e.status='active'
  and ('super_admin'=any(e.roles) or (p_kind='suggestion' and 'operations'=any(e.roles))
   or (p_kind='business_application' and e.roles&&array['operations','business_reviewer'])))
$$;
create function public.get_admin_case_ownership_v1(p_kind text,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare source jsonb; own staff_workflow_private.ownership%rowtype; history jsonb;
begin
 perform staff_workflow_private.authorize(p_kind);
 source:=staff_workflow_private.source(p_kind,p_id);
 select * into own from staff_workflow_private.ownership where kind=p_kind and case_id=p_id;
 select coalesce(jsonb_agg(to_jsonb(h) order by revision desc),'[]') into history from (
  select revision,actor_id,prior_owner,next_owner,action,occurred_at
  from staff_workflow_private.history where kind=p_kind and case_id=p_id order by revision desc limit 30
 ) h;
 return source||jsonb_build_object('kind',p_kind,'id',p_id,'revision',coalesce(own.revision,0),
  'assigned_to',own.assigned_to,
  'owner_label',case when own.assigned_to is null then 'Unassigned' else coalesce(
   (select nullif(display_name,'') from public.admin_employees where id=own.assigned_to),'Former employee') end,
  'owner_active',exists(select 1 from public.admin_employees where id=own.assigned_to and status='active'),
  'can_claim',(source->>'actionable')::boolean and own.assigned_to is null
   and staff_workflow_private.eligible(p_kind,p_id,auth.uid()),
  'can_release',(source->>'actionable')::boolean and own.assigned_to is not null
   and (own.assigned_to=auth.uid() or public.admin_user_has_permission('admin.manage')),
  'can_assign',(source->>'actionable')::boolean and public.admin_user_has_permission('admin.manage'),
  'can_decide',coalesce((source->>'can_decide')::boolean,public.admin_user_has_permission('admin.manage')) and (source->>'actionable')::boolean,
  'decision_note','Ownership coordinates review; the existing decision permissions still apply.',
  'history',history,'history_has_more',exists(select 1 from staff_workflow_private.history
   where kind=p_kind and case_id=p_id order by revision desc offset 30 limit 1));
end$$;

create function public.admin_case_ownership_command_v1(
 p_kind text,p_id uuid,p_revision bigint,p_source_version text,p_action text,p_target uuid,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target uuid; prior uuid; source jsonb;
 own staff_workflow_private.ownership%rowtype; receipt staff_workflow_private.receipts%rowtype;
 fingerprint text; result jsonb;
begin
 perform 1 from staff_workflow_private.settings where singleton for share;
 perform staff_workflow_private.authorize(p_kind);
 if p_id is null or p_revision is null or p_revision<0 or p_request_id is null
  or p_source_version is null or length(p_source_version) not between 1 and 64
  or p_action is null or p_action not in ('claim','release','assign')
  or (p_action='assign')<>(p_target is not null) then
  raise exception using errcode='22023',message='Invalid ownership command'; end if;
 target:=case when p_action='claim' then actor when p_action='assign' then p_target else null end;
 -- Fixed row order prevents two administrators assigning to each other from
 -- taking employee locks in opposite order. Revocation must wait for this write.
 perform 1 from public.admin_employees where id in(actor,target) order by id for share;
 perform staff_workflow_private.authorize(p_kind);
 if p_action='assign' and not public.admin_user_has_permission('admin.manage') then
  raise exception using errcode='42501',message='Assignment management permission required'; end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array(p_kind,p_id,p_revision,p_source_version,p_action,p_target)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('staff-ownership:'||actor||':'||p_request_id,0));
 select * into receipt from staff_workflow_private.receipts where actor_id=actor and request_id=p_request_id;
 if found then
  if receipt.fingerprint<>fingerprint then raise exception using errcode='22023',message='Retry key belongs to another command'; end if;
  -- Re-check exact source existence/authority before returning an old receipt.
  perform staff_workflow_private.source(p_kind,p_id);
  return receipt.outcome||jsonb_build_object('replayed',true);
 end if;
 source:=staff_workflow_private.source(p_kind,p_id,true);
 if source->>'source_version'<>p_source_version or not (source->>'actionable')::boolean then
  raise exception using errcode='PT409',message='Work item changed; refresh before assigning'; end if;
 insert into staff_workflow_private.ownership(kind,case_id) values(p_kind,p_id) on conflict do nothing;
 select * into own from staff_workflow_private.ownership where kind=p_kind and case_id=p_id for update;
 if own.revision<>p_revision then raise exception using errcode='PT409',message='Assignment changed; refresh before assigning'; end if;
 prior:=own.assigned_to;
 if p_action='claim' and prior is not null then
  raise exception using errcode='PT409',message='This item is already assigned'; end if;
 if p_action='release' and (prior is null or (prior<>actor and not public.admin_user_has_permission('admin.manage'))) then
  raise exception using errcode='42501',message='Only its owner or an administrator may release this item'; end if;
 if target is not null then
  if not staff_workflow_private.eligible(p_kind,p_id,target) then
   raise exception using errcode='42501',message='Target employee cannot access this queue'; end if;
 end if;
 if prior is not distinct from target then raise exception using errcode='PT409',message='Assignment is already current'; end if;
 update staff_workflow_private.ownership set assigned_to=target,revision=revision+1,updated_at=clock_timestamp()
 where kind=p_kind and case_id=p_id;
 insert into staff_workflow_private.history(kind,case_id,revision,actor_id,prior_owner,next_owner,action)
 values(p_kind,p_id,own.revision+1,actor,prior,target,p_action);
 -- Intentionally no source status/revision update, member notification, push or
 -- applicant email. Staff ownership is not a business/editorial decision.
 result:=jsonb_build_object('kind',p_kind,'id',p_id,'revision',own.revision+1,'assigned_to',target,'replayed',false);
 insert into staff_workflow_private.receipts values(actor,p_request_id,fingerprint,result);
 return result;
end$$;

create function public.get_admin_owned_work_page_v1(
 p_kind text default 'all',p_filter text default 'all',p_limit integer default 25,
 p_after_at timestamptz default null,p_after_key text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; ideas boolean; business boolean;
begin
 if auth.uid() is null or auth.jwt()->>'role' is distinct from 'doji_employee'
  or auth.jwt()->>'aal' is distinct from 'aal2' or not public.admin_user_has_permission('portal.session') then
  raise exception using errcode='42501',message='Employee MFA required'; end if;
 if not exists(select 1 from staff_workflow_private.settings where singleton and enabled) then
  raise exception using errcode='55000',message='Staff ownership is not enabled'; end if;
 if p_kind is null or p_kind not in ('all','suggestion','business_application')
  or p_filter is null or p_filter not in ('all','mine','unassigned')
  or p_limit is null or p_limit not between 1 and 50
  or (p_after_at is null)<>(p_after_key is null)
  or (p_after_key is not null and p_after_key !~ '^(suggestion|business_application):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
  raise exception using errcode='22023',message='Invalid work queue parameters'; end if;
 ideas:=p_kind in ('all','suggestion') and public.admin_user_has_permission('operations.read');
 business:=p_kind in ('all','business_application') and public.admin_user_has_permission('business.read')
  and exists(select 1 from business_private.settings where singleton and enabled
   and application_terms_version is not null and privacy_version is not null);
 -- Each indexed source is bounded BEFORE the union. No per-row RPC, offset
 -- scan, member profile join, free-text search or unbounded total-count query.
 with idea_page as (
  select 'suggestion'::text kind,s.id,s.created_at,'suggestion:'||s.id key,
   left(s.body,120) subject,o.assigned_to,coalesce(o.revision,0) revision
  from public.challenge_suggestions s left join staff_workflow_private.ownership o on o.kind='suggestion' and o.case_id=s.id
  where ideas and s.status='pending'
   and (p_after_at is null or s.created_at>=p_after_at)
   and (p_after_at is null or (s.created_at,'suggestion:'||s.id)>(p_after_at,p_after_key))
   and (p_filter='all' or (p_filter='mine' and o.assigned_to=auth.uid()) or (p_filter='unassigned' and o.assigned_to is null))
  order by s.created_at,s.id limit p_limit+1
 ), business_page as (
  select 'business_application'::text kind,a.id,a.created_at,'business_application:'||a.id key,
   coalesce(nullif(left(s.details->>'brand_name',120),''),'Business application') subject,o.assigned_to,coalesce(o.revision,0) revision
  from business_private.applications a left join staff_workflow_private.ownership o on o.kind='business_application' and o.case_id=a.id
  left join business_private.submissions s on s.application_id=a.id and s.submission=a.submission
  where business and a.state='pending'
   and (p_after_at is null or a.created_at>=p_after_at)
   and (p_after_at is null or (a.created_at,'business_application:'||a.id)>(p_after_at,p_after_key))
   and (p_filter='all' or (p_filter='mine' and o.assigned_to=auth.uid()) or (p_filter='unassigned' and o.assigned_to is null))
  order by a.created_at,a.id limit p_limit+1
 ), combined as (
  select * from idea_page union all select * from business_page
 ), bounded as (select * from combined order by created_at,key limit p_limit+1),
 page as (select * from bounded order by created_at,key limit p_limit)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p) order by created_at,key) from page p),'[]'),
  'next_cursor',case when (select count(*) from bounded)>p_limit then
   (select jsonb_build_object('at',created_at,'key',key) from page order by created_at desc,key desc limit 1) else null end,
  'scope','business_applications_and_community_ideas','order','oldest_first',
  'included_queues',to_jsonb(array_remove(array[case when ideas then 'suggestion' end,case when business then 'business_application' end],null)))
 into result;
 return result;
end$$;

revoke all on all functions in schema staff_workflow_private from public,anon,authenticated,doji_employee,service_role;
revoke all on function public.get_admin_case_ownership_v1(text,uuid),
 public.get_admin_owned_work_page_v1(text,text,integer,timestamptz,text),
 public.admin_case_ownership_command_v1(text,uuid,bigint,text,text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_admin_case_ownership_v1(text,uuid),
 public.get_admin_owned_work_page_v1(text,text,integer,timestamptz,text),
 public.admin_case_ownership_command_v1(text,uuid,bigint,text,text,uuid,uuid) to doji_employee;
commit;
