-- LOCAL CANDIDATE ONLY. No scheduling, public endpoint or automatic erasure.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create table business_private.privacy_settings(singleton boolean primary key check(singleton),enabled boolean not null default false);
insert into business_private.privacy_settings values(true,false);
create table business_private.privacy_controls(
 account_id uuid primary key references business_private.accounts(id),
 hold_reference text,
 hold_case_id uuid,
 erasure_case_id uuid
);
create table business_private.privacy_cases(
 id uuid primary key default gen_random_uuid(), account_id uuid not null references business_private.accounts(id),
 kind text not null check(kind in ('access','correction','closure','erasure')),
 state text not null default 'open' check(state in ('open','prepared','executing','primary_erased','completed','denied')),
 revision bigint not null default 1,
 verification_reference text not null,
 received_at timestamptz not null default clock_timestamp(),
 due_at timestamptz not null,
 updated_at timestamptz not null default clock_timestamp(),
 execution_id uuid,
 -- Only a temporary cleanup key. Cleared when primary erasure finishes.
 cleanup_email text
);
create index business_privacy_queue on business_private.privacy_cases(state,due_at,id);
create index business_privacy_account on business_private.privacy_cases(account_id,id);
create table business_private.privacy_history(
 case_id uuid not null references business_private.privacy_cases(id),revision bigint not null,
 actor_id uuid, action text not null, evidence_reference text not null,
 occurred_at timestamptz not null default clock_timestamp(),primary key(case_id,revision)
);
create table business_private.privacy_receipts(
 actor_id uuid not null,request_id uuid not null,fingerprint text not null,outcome jsonb not null,
 primary key(actor_id,request_id)
);
do $$declare t text; begin
 foreach t in array array['privacy_settings','privacy_controls','privacy_cases','privacy_history','privacy_receipts'] loop
  execute format('alter table business_private.%I enable row level security',t);
  execute format('revoke all on business_private.%I from public,anon,authenticated,doji_employee,doji_business,service_role',t);
 end loop;
end$$;
create function business_private.privacy_enabled() returns void language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from business_private.privacy_settings where singleton and enabled) then
  raise exception using errcode='55000',message='Business privacy workflow disabled'; end if;
end$$;
create function business_private.privacy_actor() returns uuid language plpgsql security definer set search_path='' as $$begin
 perform business_private.privacy_enabled();
 if auth.uid() is null or auth.jwt()->>'role' is distinct from 'doji_employee' or auth.jwt()->>'aal' is distinct from 'aal2' then
  raise exception using errcode='42501',message='Restricted employee MFA required'; end if;
 perform 1 from public.admin_employees where id=auth.uid() for share;
 if not public.admin_user_has_permission('admin.manage') or not public.admin_user_has_permission('legal.read') then
  raise exception using errcode='42501',message='Restricted privacy permission required'; end if;
 return auth.uid();
end$$;
create function business_private.privacy_reference(p_value text) returns void language plpgsql set search_path='' as $$begin
 if p_value is null or p_value !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,127}$' then
  raise exception using errcode='22023',message='Use an opaque evidence reference, not personal information'; end if;
end$$;
create function business_private.privacy_invalidate(p_account_id uuid) returns void language plpgsql security definer set search_path='' as $$declare a business_private.applications%rowtype; begin
 if not exists(select 1 from business_private.settings where singleton and realtime_enabled) then return; end if;
 select * into a from business_private.applications where applicant_id=p_account_id;
 if not found then return; end if;
 perform public.enqueue_domain_event('moderation:global','moderation.business.updated',a.id,
  jsonb_build_object('applicationId',a.id,'sendPush',false),'business:privacy:staff:'||a.id||':'||a.revision);
 perform public.enqueue_domain_event('business:'||p_account_id||':events','business.application.updated',a.id,
  jsonb_build_object('applicationId',a.id,'applicantId',p_account_id,'sendPush',false),'business:privacy:applicant:'||a.id||':'||a.revision);
end$$;
create function business_private.privacy_target(p_id uuid,p_absent_ok boolean default false) returns void language plpgsql security definer set search_path='' as $$begin
 if p_id is null or exists(select 1 from public.profiles where id=p_id) or exists(select 1 from public.admin_employees where id=p_id)
  or exists(select 1 from auth.users where id=p_id and (role is distinct from 'doji_business' or raw_app_meta_data->>'account_type' is distinct from 'business'))
  or (not p_absent_ok and not exists(select 1 from auth.users where id=p_id and deleted_at is null)) then
  raise exception using errcode='42501',message='Exact separate business identity required'; end if;
end$$;

create function public.admin_business_privacy_open_v1(p_account_id uuid,p_kind text,p_verification_reference text,p_due_at timestamptz,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; f text; r business_private.privacy_receipts%rowtype; c business_private.privacy_cases%rowtype; result jsonb;
begin
 actor:=business_private.privacy_actor();
 perform business_private.privacy_reference(p_verification_reference);
 if p_kind is null or p_kind not in ('access','correction','closure','erasure') or p_due_at is null or p_request_id is null then
  raise exception using errcode='22023',message='Request type, assessed deadline and retry key required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('business-privacy:'||actor||':'||p_request_id,0));
 f:=encode(sha256(convert_to(jsonb_build_array(p_account_id,p_kind,p_verification_reference,p_due_at)::text,'UTF8')),'hex');
 select * into r from business_private.privacy_receipts where actor_id=actor and request_id=p_request_id;
 if found then
  if r.fingerprint<>f then raise exception using errcode='22023',message='Retry key belongs to a different command'; end if;
  return r.outcome; end if;
 perform business_private.privacy_target(p_account_id);
 -- Account row is also the existing application/review command serialization lock.
 insert into business_private.accounts(id) values(p_account_id) on conflict do nothing;
 perform 1 from business_private.accounts where id=p_account_id for update;
 insert into business_private.privacy_controls(account_id) values(p_account_id) on conflict do nothing;
 insert into business_private.privacy_cases(account_id,kind,verification_reference,due_at)
 values(p_account_id,p_kind,p_verification_reference,p_due_at) returning * into c;
 insert into business_private.privacy_history values(c.id,1,actor,'received',p_verification_reference,clock_timestamp());
 result:=jsonb_build_object('id',c.id,'revision',1,'state','open');
 insert into business_private.privacy_receipts values(actor,p_request_id,f,result);
 return result;
end$$;

-- Explicit page, no recurring portal polling; no member or credential fields.
create function public.get_admin_business_privacy_page_v1(p_state text,p_after_due timestamptz default null,p_after_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb; begin
 perform business_private.privacy_actor();
 if p_state is null or p_state not in ('open','prepared','executing','primary_erased','completed','denied') or (p_after_due is null)<>(p_after_id is null) then
  raise exception using errcode='22023',message='Valid state and complete cursor required'; end if;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (
  select id,account_id,kind,state,revision,received_at,due_at from business_private.privacy_cases
  where state=p_state and (p_after_due is null or (due_at,id)>(p_after_due,p_after_id)) order by due_at,id limit 25
 ) q; return result;
end$$;

-- Export is scoped to ONE verified access case. Staff notes, credentials and other
-- customers are excluded. History is paged; submissions have a hard maximum of 50.
create function public.get_admin_business_privacy_access_v1(p_case_id uuid,p_after_revision bigint default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c business_private.privacy_cases%rowtype; a business_private.applications%rowtype; result jsonb;
begin
 perform business_private.privacy_actor();
 select * into c from business_private.privacy_cases where id=p_case_id and kind='access' and state='open';
 if not found or p_after_revision is null or p_after_revision<0 then raise exception using errcode='P0002',message='Open verified access request required'; end if;
 perform business_private.privacy_target(c.account_id,true);
 select * into a from business_private.applications where applicant_id=c.account_id;
 result:=jsonb_build_object('case_id',c.id,'account_id',c.account_id,
  'identity',(select jsonb_build_object('email',email,'name',raw_user_meta_data->>'display_name') from auth.users where id=c.account_id),
  'signup_agreement',(select to_jsonb(s) from business_private.signup_agreements s where account_id=c.account_id),
  'application',case when a.id is null then null else jsonb_build_object('id',a.id,'details',a.details,'state',a.state,'response',a.response,'revision',a.revision) end,
  'submissions',(select coalesce(jsonb_agg(to_jsonb(s) order by submission),'[]') from business_private.submissions s where application_id=a.id),
  'history',(select coalesce(jsonb_agg(to_jsonb(q) order by revision),'[]') from (
   select revision,action,response,occurred_at from business_private.history where application_id=a.id and revision>p_after_revision order by revision limit 30
  ) q),
  'history_has_more',exists(select 1 from business_private.history where application_id=a.id and revision>p_after_revision offset 30 limit 1));
 return result;
end$$;

create function public.get_admin_business_privacy_case_v1(p_case_id uuid,p_after_revision bigint default 0)
returns jsonb language plpgsql security definer set search_path='' as $$declare c business_private.privacy_cases%rowtype; begin
 perform business_private.privacy_actor();
 select * into c from business_private.privacy_cases where id=p_case_id;
 if not found or p_after_revision is null or p_after_revision<0 then raise exception using errcode='P0002',message='Privacy case unavailable'; end if;
 return (to_jsonb(c)-'cleanup_email')||jsonb_build_object(
  'hold',(select jsonb_build_object('reference',hold_reference,'case_id',hold_case_id) from business_private.privacy_controls where account_id=c.account_id),
  'history',(select coalesce(jsonb_agg(to_jsonb(q) order by revision),'[]') from (
   select revision,actor_id,action,evidence_reference,occurred_at from business_private.privacy_history where case_id=c.id and revision>p_after_revision order by revision limit 30
  ) q),
  'history_has_more',exists(select 1 from business_private.privacy_history where case_id=c.id and revision>p_after_revision offset 30 limit 1));
end$$;

-- Read only the current draft for ONE verified, open correction request. This
-- does not reuse the submitted-snapshot review contract or expose Auth metadata.
create function public.get_admin_business_privacy_correction_v1(p_case_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c business_private.privacy_cases%rowtype; a business_private.applications%rowtype; blocked text;
begin
 perform business_private.privacy_actor();
 select * into c from business_private.privacy_cases where id=p_case_id and kind='correction' and state='open';
 if not found then raise exception using errcode='P0002',message='Open verified correction request required'; end if;
 perform business_private.privacy_target(c.account_id);
 select * into a from business_private.applications where applicant_id=c.account_id;
 blocked:=case
  when exists(select 1 from business_private.privacy_controls where account_id=c.account_id and erasure_case_id is not null) then 'erasure_prepared'
  when a.id is null then 'no_application'
  when a.state not in ('draft','changes_requested') then 'review_required'
  else null end;
 return jsonb_build_object('case_id',c.id,'case_revision',c.revision,'account_id',c.account_id,
  'correction_allowed',blocked is null,'blocked_reason',blocked,
  'application',case when a.id is null then null else jsonb_build_object('id',a.id,'revision',a.revision,'state',a.state,'details',a.details) end);
end$$;

create function public.admin_business_privacy_command_v1(p_case_id uuid,p_revision bigint,p_action text,p_reference text,p_request_id uuid,p_details jsonb default null,p_application_revision bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; c business_private.privacy_cases%rowtype; ctl business_private.privacy_controls%rowtype;
 a business_private.applications%rowtype; r business_private.privacy_receipts%rowtype; f text; result jsonb;
begin
 actor:=business_private.privacy_actor(); perform business_private.privacy_reference(p_reference);
 if p_case_id is null or p_request_id is null or p_revision is null or p_action is null or p_action not in
 ('hold','release_hold','correct_draft','close_account','prepare_erasure','complete','deny') then
 raise exception using errcode='22023',message='Valid privacy command required'; end if;
 if p_action<>'correct_draft' and (p_details is not null or p_application_revision is not null) then
 raise exception using errcode='22023',message='Unexpected correction fields'; end if;
 perform pg_advisory_xact_lock(hashtextextended('business-privacy:'||actor||':'||p_request_id,0));
 f:=encode(sha256(convert_to(jsonb_build_array(p_case_id,p_revision,p_action,p_reference,p_details,p_application_revision)::text,'UTF8')),'hex');
 select * into r from business_private.privacy_receipts where actor_id=actor and request_id=p_request_id;
 if found then
  if r.fingerprint<>f then raise exception using errcode='22023',message='Retry key belongs to a different command'; end if;
  return r.outcome; end if;
 select * into c from business_private.privacy_cases where id=p_case_id;
 if not found then raise exception using errcode='P0002',message='Privacy case unavailable'; end if;
 perform business_private.privacy_target(c.account_id,true);
 perform 1 from business_private.accounts where id=c.account_id for update;
 select * into c from business_private.privacy_cases where id=p_case_id for update;
 select * into ctl from business_private.privacy_controls where account_id=c.account_id for update;
 if c.revision<>p_revision then raise exception using errcode='PT409',message='Privacy case changed; reload first'; end if;
 if c.state in ('completed','denied') and p_action not in ('hold','release_hold') then raise exception using errcode='55000',message='Privacy case is closed'; end if;
 if p_action in ('hold','release_hold') then
  if exists(select 1 from business_private.privacy_cases where id=ctl.erasure_case_id and state in ('executing','primary_erased','completed')) then
   raise exception using errcode='55000',message='Erasure already started; escalate immediately'; end if;
  if p_action='hold' and ctl.hold_reference is not null then raise exception using errcode='55000',message='Existing hold must be reviewed in its original case'; end if;
  if p_action='release_hold' and ctl.hold_case_id is distinct from c.id then raise exception using errcode='PT409',message='Release the current hold from its original case'; end if;
  update business_private.privacy_controls set hold_reference=case when p_action='hold' then p_reference else null end,
   hold_case_id=case when p_action='hold' then c.id else null end where account_id=c.account_id;
 elsif p_action='correct_draft' then
  if c.kind<>'correction' or c.state<>'open' then raise exception using errcode='55000',message='Open correction case required'; end if;
  select * into a from business_private.applications where applicant_id=c.account_id for update;
  if a.id is null or a.revision is distinct from p_application_revision then raise exception using errcode='PT409',message='Application changed; reload first'; end if;
  if a.state not in ('draft','changes_requested') or ctl.erasure_case_id is not null then
   raise exception using errcode='55000',message='Reopen through business review before correction'; end if;
  perform business_private.validate_details(p_details,false);
  update business_private.applications set details=p_details,revision=revision+1,updated_at=clock_timestamp() where id=a.id;
  insert into business_private.history(application_id,revision,actor_id,actor_kind,action,response,internal_note)
   values(a.id,a.revision+1,actor,'employee','privacy_correction','Business application draft corrected after verified request.',p_reference);
  -- Existing submitted snapshots and agreement records remain unchanged.
 elsif p_action in ('close_account','prepare_erasure') then
  if c.state<>'open' or c.kind<>(case when p_action='close_account' then 'closure' else 'erasure' end) then
   raise exception using errcode='55000',message='Matching open closure or erasure case required'; end if;
  if p_action='prepare_erasure' then
   if ctl.hold_reference is not null or ctl.erasure_case_id is not null then raise exception using errcode='55000',message='Legal hold or another erasure blocks this request'; end if;
   perform business_private.privacy_target(c.account_id);
   update business_private.privacy_controls set erasure_case_id=c.id where account_id=c.account_id;
   c.state:='prepared';
  end if;
  update business_private.accounts set disabled=true where id=c.account_id;
  update business_private.applications set revision=revision+1,updated_at=clock_timestamp() where applicant_id=c.account_id;
  update business_private.organizations set status='suspended' where application_id in (select id from business_private.applications where applicant_id=c.account_id);
 elsif p_action='complete' then
  if c.kind='erasure' and c.state<>'primary_erased' then raise exception using errcode='55000',message='Primary erasure and provider evidence required'; end if;
  if c.kind='closure' and not exists(select 1 from business_private.accounts where id=c.account_id and disabled) then raise exception using errcode='55000',message='Close account before completion'; end if;
  c.state:='completed';
 elsif p_action='deny' then
  if c.state<>'open' then raise exception using errcode='55000',message='Started erasure cannot be dismissed'; end if;
  c.state:='denied';
 end if;
 update business_private.privacy_cases set revision=revision+1,state=c.state,updated_at=clock_timestamp() where id=c.id;
 insert into business_private.privacy_history values(c.id,c.revision+1,actor,p_action,p_reference,clock_timestamp());
 result:=jsonb_build_object('id',c.id,'revision',c.revision+1,'state',c.state);
 insert into business_private.privacy_receipts values(actor,p_request_id,f,result);
 if p_action in ('correct_draft','close_account','prepare_erasure') then perform business_private.privacy_invalidate(c.account_id); end if;
 return result;
end$$;

-- Durable one-time authorization. On retry, caller may READ Auth to reconcile,
-- but must not repeat DELETE automatically after an ambiguous provider result.
create function public.claim_business_erasure_v1(p_case_id uuid,p_execution_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c business_private.privacy_cases%rowtype; ctl business_private.privacy_controls%rowtype; fresh boolean:=false;
begin
 perform business_private.privacy_enabled();
 if p_execution_id is null then raise exception using errcode='22023',message='Execution ID required'; end if;
 select * into c from business_private.privacy_cases where id=p_case_id;
 if not found then raise exception using errcode='P0002',message='Erasure case unavailable'; end if;
 perform 1 from business_private.accounts where id=c.account_id and disabled for update;
 if not found then raise exception using errcode='42501',message='Closed business account required'; end if;
 select * into c from business_private.privacy_cases where id=p_case_id for update;
 select * into ctl from business_private.privacy_controls where account_id=c.account_id for update;
 perform business_private.privacy_target(c.account_id,true);
 if c.kind<>'erasure' or c.state not in ('prepared','executing','primary_erased','completed') or ctl.erasure_case_id is distinct from c.id or ctl.hold_reference is not null then
  raise exception using errcode='55000',message='Authorized unheld erasure required'; end if;
 if c.state='prepared' then
  perform business_private.privacy_target(c.account_id);
  update business_private.privacy_cases set state='executing',execution_id=p_execution_id,
   cleanup_email=(select lower(email) from auth.users where id=c.account_id),revision=revision+1,updated_at=clock_timestamp() where id=c.id;
  insert into business_private.privacy_history values(c.id,c.revision+1,null,'execution_started','system:auth-erasure',clock_timestamp());
  fresh:=true;
 elsif c.execution_id is distinct from p_execution_id then raise exception using errcode='PT409',message='Different erasure execution owns this case'; end if;
 return jsonb_build_object('account_id',c.account_id,'delete_authorized',fresh,'state',case when fresh then 'executing' else c.state end);
end$$;

create function public.finish_business_erasure_v1(p_case_id uuid,p_execution_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$declare c business_private.privacy_cases%rowtype; app uuid;
begin
 perform business_private.privacy_enabled();
 select * into c from business_private.privacy_cases where id=p_case_id;
 if not found then raise exception using errcode='P0002',message='Erasure case unavailable'; end if;
 perform 1 from business_private.accounts where id=c.account_id for update;
 select * into c from business_private.privacy_cases where id=p_case_id for update;
 if p_execution_id is null or c.execution_id is distinct from p_execution_id or c.kind<>'erasure' then raise exception using errcode='42501',message='Exact erasure execution required'; end if;
 if c.state in ('primary_erased','completed') then return jsonb_build_object('state',c.state); end if;
 if c.state<>'executing' then raise exception using errcode='55000',message='Erasure not executing'; end if;
 perform business_private.privacy_target(c.account_id,true);
 if exists(select 1 from auth.users where id=c.account_id) then raise exception using errcode='55000',message='Auth deletion not confirmed'; end if;
 if exists(select 1 from business_private.privacy_controls where account_id=c.account_id and hold_reference is not null) then raise exception using errcode='55000',message='Legal hold blocks erasure'; end if;
 select id into app from business_private.applications where applicant_id=c.account_id for update;
 update business_private.applications set details='{}',response='',revision=revision+1,updated_at=clock_timestamp() where id=app;
 update business_private.submissions set details='{}' where application_id=app;
 update business_private.history set response='',internal_note='' where application_id=app;
 update public.admin_audit_log set reason='Business privacy erasure: retained decision metadata only' where entity_type='business_application' and entity_id=app::text;
 delete from business_private.memberships where account_id=c.account_id;
 delete from business_private.auth_budgets where email=c.cleanup_email;
 update business_private.auth_settings set allowed_emails=array_remove(allowed_emails,c.cleanup_email) where singleton;
 update business_private.privacy_cases set cleanup_email=null,state='primary_erased',revision=revision+1,updated_at=clock_timestamp() where id=c.id;
 insert into business_private.privacy_history values(c.id,c.revision+1,null,'primary_erased','system:primary-erasure',clock_timestamp());
 perform business_private.privacy_invalidate(c.account_id);
 return jsonb_build_object('state','primary_erased');
end$$;

revoke all on all functions in schema business_private from public,anon,authenticated,doji_employee,doji_business,service_role;
revoke all on function public.admin_business_privacy_open_v1(uuid,text,text,timestamptz,uuid),
 public.get_admin_business_privacy_page_v1(text,timestamptz,uuid),public.get_admin_business_privacy_access_v1(uuid,bigint),
 public.get_admin_business_privacy_case_v1(uuid,bigint),
 public.get_admin_business_privacy_correction_v1(uuid),
 public.admin_business_privacy_command_v1(uuid,bigint,text,text,uuid,jsonb,bigint),
 public.claim_business_erasure_v1(uuid,uuid),public.finish_business_erasure_v1(uuid,uuid)
 from public,anon,authenticated,doji_employee,doji_business,service_role;
grant execute on function public.admin_business_privacy_open_v1(uuid,text,text,timestamptz,uuid),
 public.get_admin_business_privacy_page_v1(text,timestamptz,uuid),public.get_admin_business_privacy_access_v1(uuid,bigint),
 public.get_admin_business_privacy_case_v1(uuid,bigint),
 public.get_admin_business_privacy_correction_v1(uuid),
 public.admin_business_privacy_command_v1(uuid,bigint,text,text,uuid,jsonb,bigint) to doji_employee;
grant execute on function public.claim_business_erasure_v1(uuid,uuid),public.finish_business_erasure_v1(uuid,uuid) to service_role;
commit;
