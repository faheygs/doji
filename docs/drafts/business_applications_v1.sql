-- PREPARATION ONLY: not in automatic migrations, not approved for deployment.
-- No Auth provisioning, authenticator membership, gateway, email or client cutover.
-- See BUSINESS_APPLICATION_FOUNDATION_2026-09-29.md before promotion.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';

create role doji_business nologin noinherit;
grant usage on schema public to doji_business;
-- Deliberately NOT granted to authenticator until effective PUBLIC grants,
-- hosted Auth persistence and member/session regressions have been qualified.
create schema business_private;
revoke all on schema business_private from public,anon,authenticated,doji_employee,doji_business,service_role;

create table business_private.settings (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 realtime_enabled boolean not null default false,
 application_terms_version text,
 privacy_version text
);
insert into business_private.settings(singleton) values(true);
create table business_private.accounts (
 id uuid primary key,
 disabled boolean not null default false,
 created_at timestamptz not null default clock_timestamp(),
 budget_at timestamptz not null default clock_timestamp(),
 budget_used integer not null default 0
);
-- Opaque actor UUIDs intentionally outlive Auth deletion. Authorization always
-- checks the live Auth row. No profile FK, social row, member trigger or cascade.
create table business_private.applications (
 id uuid primary key default gen_random_uuid(),
 applicant_id uuid not null unique references business_private.accounts(id),
 state text not null default 'draft' check(state in ('draft','pending','changes_requested','approved','declined')),
 revision bigint not null default 1 check(revision>0),
 submission integer not null default 0 check(submission between 0 and 50),
 details jsonb not null default '{}',
 response text not null default '',
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 submitted_at timestamptz
);
create index business_applications_queue on business_private.applications(state,updated_at,id);
create table business_private.submissions (
 application_id uuid not null references business_private.applications(id),
 submission integer not null,
 details jsonb not null,
 terms_version text not null,
 privacy_version text not null,
 accepted_at timestamptz not null,
 primary key(application_id,submission)
);
create table business_private.organizations (
 id uuid primary key default gen_random_uuid(),
 application_id uuid not null unique references business_private.applications(id),
 status text not null check(status in ('active','suspended')),
 approved_submission integer not null,
 foreign key(application_id,approved_submission) references business_private.submissions(application_id,submission)
);
create table business_private.memberships (
 organization_id uuid not null references business_private.organizations(id),
 account_id uuid not null references business_private.accounts(id),
 role text not null check(role='owner'),
 primary key(organization_id,account_id)
);
create index business_memberships_actor on business_private.memberships(account_id,organization_id);
create table business_private.history (
 id uuid primary key default gen_random_uuid(),
 application_id uuid not null references business_private.applications(id),
 revision bigint not null,
 actor_id uuid not null,
 actor_kind text not null check(actor_kind in ('business','employee')),
 action text not null,
 response text not null default '',
 internal_note text not null default '',
 occurred_at timestamptz not null default clock_timestamp(),
 unique(application_id,revision)
);
create table business_private.receipts (
 actor_id uuid not null,
 request_id uuid not null,
 fingerprint text not null,
 application_id uuid not null references business_private.applications(id),
 outcome jsonb not null,
 primary key(actor_id,request_id)
);

-- Defense in depth. No direct table access, including service-role defaults.
do $$declare t record; begin
 for t in select tablename from pg_tables where schemaname='business_private' loop
  execute format('alter table business_private.%I enable row level security',t.tablename);
  execute format('revoke all on business_private.%I from public,anon,authenticated,doji_employee,doji_business,service_role',t.tablename);
 end loop;
end$$;

create function business_private.assert_enabled() returns void
language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from business_private.settings where singleton and enabled
   and application_terms_version is not null and privacy_version is not null) then
  raise exception using errcode='55000',message='Business applications are not enabled';
 end if;
end$$;

create function business_private.business_actor(p_write boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); a business_private.accounts%rowtype;
begin
 perform business_private.assert_enabled();
 if uid is null or coalesce(auth.jwt()->>'role','')<>'doji_business' then
  raise exception using errcode='42501',message='Separate business account required'; end if;
 -- Match both the server-owned Auth type and database role; user metadata is
 -- neither authority nor a way to turn a member/employee into a business account.
 perform 1 from auth.users where id=uid and role='doji_business'
   and raw_app_meta_data->>'account_type'='business' and email_confirmed_at is not null and deleted_at is null
   and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found or exists(select 1 from public.profiles where id=uid)
   or exists(select 1 from public.admin_employees where id=uid) then
  raise exception using errcode='42501',message='Verified business account required'; end if;
 if p_write then
  insert into business_private.accounts(id) values(uid) on conflict do nothing;
  select * into a from business_private.accounts where id=uid for update;
 else
  select * into a from business_private.accounts where id=uid for share;
 end if;
 if a.disabled then raise exception using errcode='42501',message='Business access disabled'; end if;
 return uid;
end$$;

create function business_private.staff_actor(p_write boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$begin
 perform business_private.assert_enabled();
 if auth.uid() is null or coalesce(auth.jwt()->>'role','')<>'doji_employee'
   or coalesce(auth.jwt()->>'aal','')<>'aal2' then
  raise exception using errcode='42501',message='Verified employee MFA required'; end if;
 -- Serializes decisions against staff role revocation without changing its command.
 perform 1 from public.admin_employees where id=auth.uid() for share;
 if not public.admin_user_has_permission(case when p_write then 'admin.manage' else 'business.read' end) then
  raise exception using errcode='42501',message='Business review permission required'; end if;
 return auth.uid();
end$$;

create function business_private.validate_details(p_details jsonb,p_complete boolean) returns void
language plpgsql set search_path='' as $$declare k text; v jsonb; begin
 if p_details is null or jsonb_typeof(p_details)<>'object' or octet_length(p_details::text)>8192 then
  raise exception using errcode='22023',message='Invalid application details'; end if;
 for k,v in select * from jsonb_each(p_details) loop
  if k<>all(array['legal_name','brand_name','website','country','business_address','representative_name','representative_role','category','purpose'])
    or jsonb_typeof(v)<>'string' or length(v#>>'{}')>1000 or (v#>>'{}')~'[[:cntrl:]]' then
   raise exception using errcode='22023',message='Unsupported application field'; end if;
 end loop;
 if p_complete then
  foreach k in array array['legal_name','brand_name','website','country','representative_name','representative_role','category','purpose'] loop
   if length(btrim(coalesce(p_details->>k,'')))<1 then
    raise exception using errcode='22023',message='Complete all application fields'; end if;
  end loop;
 end if;
 if coalesce(p_details->>'website','')<>'' and (length(p_details->>'website')>2048
   or (p_details->>'website')!~'^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}(/[A-Za-z0-9._~!$&()*+,;=:@%/?#-]*)?$') then
  raise exception using errcode='22023',message='Use a public HTTPS company website without credentials'; end if;
 if coalesce(p_details->>'country','')<>'' and (p_details->>'country')!~'^[A-Z]{2}$' then
  raise exception using errcode='22023',message='Use a two-letter country code'; end if;
 -- URL is recorded for human review, NEVER fetched by this command.
end$$;

create function business_private.item(p_id uuid,p_staff boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a business_private.applications%rowtype; h jsonb; s jsonb;
begin
 select * into a from business_private.applications where id=p_id;
 if not found then raise exception using errcode='P0002',message='Application unavailable'; end if;
 select coalesce(jsonb_agg(x.v order by x.revision desc),'[]') into h from (
  select revision,jsonb_build_object('revision',revision,'action',action,'response',response,'occurred_at',occurred_at)
   || case when p_staff then jsonb_build_object('internal_note',internal_note,'actor_id',actor_id,'actor_kind',actor_kind) else '{}'::jsonb end v
  from business_private.history where application_id=p_id order by revision desc limit 30
 ) x;
 select jsonb_build_object('submission',submission,'details',details,'terms_version',terms_version,
  'privacy_version',privacy_version,'accepted_at',accepted_at) into s
  from business_private.submissions where application_id=p_id and submission=a.submission;
 -- Reviewers see the last explicitly submitted version, never unsent edits.
 return jsonb_build_object('id',a.id,'state',a.state,'revision',a.revision,
  'details',case when p_staff then s->'details' else a.details end,
  'response',a.response,'created_at',a.created_at,'updated_at',a.updated_at,'submitted_at',a.submitted_at,
  'latest_submission',s,'history',h,'history_has_more',a.revision>30)
  || case when p_staff then jsonb_build_object('applicant_id',a.applicant_id) else '{}'::jsonb end;
end$$;

create function public.get_business_application_v1() returns jsonb
language plpgsql security definer set search_path='' as $$declare uid uuid; aid uuid; begin
 uid:=business_private.business_actor(false);
 select id into aid from business_private.applications where applicant_id=uid;
 if aid is null then return null; end if;
 return business_private.item(aid,false);
end$$;

create function public.get_business_workspace_v1() returns jsonb
language plpgsql security definer set search_path='' as $$declare uid uuid; result jsonb; begin
 uid:=business_private.business_actor(false);
 if coalesce(auth.jwt()->>'aal','')<>'aal2' then
  raise exception using errcode='42501',message='Business workspace requires MFA'; end if;
 select jsonb_build_object('organization_id',o.id,'role',m.role,'brand_name',s.details->>'brand_name',
  'campaigns_enabled',false,'billing_enabled',false) into result
 from business_private.memberships m join business_private.organizations o on o.id=m.organization_id
 join business_private.applications a on a.id=o.application_id and a.state='approved'
 join business_private.submissions s on s.application_id=o.application_id and s.submission=o.approved_submission
 where m.account_id=uid and o.status='active';
 if result is null then raise exception using errcode='42501',message='Approved organization required'; end if;
 return result;
end$$;

create function public.business_application_command_v1(p_action text,p_revision bigint,p_details jsonb,
 p_terms_version text,p_privacy_version text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid; a business_private.applications%rowtype; r business_private.receipts%rowtype;
 fingerprint text; config business_private.settings%rowtype; result jsonb; used integer;
begin
 uid:=business_private.business_actor(true); -- actor row serializes all its commands
 if p_request_id is null or p_action is null or p_action not in ('save','submit') then
  raise exception using errcode='22023',message='Invalid application command'; end if;
 perform business_private.validate_details(p_details,p_action='submit');
 fingerprint:=encode(sha256(convert_to(jsonb_build_array('application',p_action,p_revision,p_details,p_terms_version,p_privacy_version)::text,'UTF8')),'hex');
 select * into r from business_private.receipts where actor_id=uid and request_id=p_request_id;
 if found then
  if r.fingerprint<>fingerprint then raise exception using errcode='22023',message='Retry key belongs to a different command'; end if;
  return jsonb_build_object('outcome',r.outcome,'application',business_private.item(r.application_id,false),'replayed',true);
 end if;
 update business_private.accounts set budget_at=case when budget_at<=clock_timestamp()-interval '1 hour' then clock_timestamp() else budget_at end,
  budget_used=case when budget_at<=clock_timestamp()-interval '1 hour' then 1 else budget_used+1 end
  where id=uid returning budget_used into used;
 if used>60 then raise exception using errcode='P0001',message='Application change limit reached'; end if;
 select * into a from business_private.applications where applicant_id=uid for update;
 if not found then
  if p_revision is not null then raise exception using errcode='PT409',message='Application changed; reload first'; end if;
  insert into business_private.applications(applicant_id) values(uid) returning * into a;
 else
  if p_revision is distinct from a.revision then raise exception using errcode='PT409',message='Application changed; reload first'; end if;
  if a.state not in ('draft','changes_requested') then
   raise exception using errcode='55000',message='This application cannot be edited'; end if;
  a.revision:=a.revision+1;
 end if;
 if p_action='submit' then
  select * into config from business_private.settings where singleton for share;
  if p_terms_version is distinct from config.application_terms_version or p_privacy_version is distinct from config.privacy_version then
   raise exception using errcode='22023',message='Accept the current application terms and privacy notice'; end if;
  if a.submission>=50 then raise exception using errcode='55000',message='Contact support before submitting another revision'; end if;
  a.submission:=a.submission+1;
  insert into business_private.submissions values(a.id,a.submission,p_details,p_terms_version,p_privacy_version,clock_timestamp());
  a.state:='pending'; a.submitted_at:=clock_timestamp();
 end if;
 update business_private.applications set details=p_details,state=a.state,revision=a.revision,
  submission=a.submission,submitted_at=a.submitted_at,updated_at=clock_timestamp() where id=a.id;
 insert into business_private.history(application_id,revision,actor_id,actor_kind,action)
 values(a.id,a.revision,uid,'business',p_action);
 result:=jsonb_build_object('id',a.id,'revision',a.revision,'state',a.state,'action',p_action);
 insert into business_private.receipts values(uid,p_request_id,fingerprint,a.id,result);
 -- Draft saves are private to the applicant, not staff review work.
 if (select realtime_enabled from business_private.settings where singleton) then
 if p_action='submit' then
  perform public.enqueue_domain_event('moderation:global','moderation.business.updated',a.id,
   jsonb_build_object('applicationId',a.id,'sendPush',false),'business:staff:'||a.id||':'||a.revision);
 end if;
 perform public.enqueue_domain_event('business:'||uid||':events','business.application.updated',a.id,
  jsonb_build_object('applicationId',a.id,'applicantId',uid,'sendPush',false),'business:applicant:'||a.id||':'||a.revision);
 end if;
 return jsonb_build_object('outcome',result,'application',business_private.item(a.id,false),'replayed',false);
end$$;

create function public.get_admin_business_application_v1(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$begin
 perform business_private.staff_actor(false);
 if not exists(select 1 from business_private.applications where id=p_id and submission>0) then
  raise exception using errcode='P0002',message='Application unavailable'; end if;
 return business_private.item(p_id,true);
end$$;

create function public.get_admin_business_applications_page_v1(p_state text default 'pending',p_limit integer default 25,
 p_after_at timestamptz default null,p_after_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare rows jsonb; cursor jsonb; begin
 perform business_private.staff_actor(false);
 if p_state is null or p_state not in ('pending','changes_requested','approved','declined')
  or p_limit is null or p_limit not between 1 and 50 or (p_after_at is null)<>(p_after_id is null) then
  raise exception using errcode='22023',message='Invalid page parameters'; end if;
 with page as (
  select a.id,a.state,a.revision,a.updated_at,s.details->>'brand_name' brand_name
  from business_private.applications a join business_private.submissions s
   on s.application_id=a.id and s.submission=a.submission
  where a.state=p_state and a.submission>0
   and (p_after_at is null or (a.updated_at,a.id)>(p_after_at,p_after_id)) order by a.updated_at,a.id limit p_limit+1
 ), numbered as(select *,row_number() over(order by updated_at,id) rn from page)
 select coalesce(jsonb_agg(to_jsonb(n)-'rn' order by updated_at,id) filter(where rn<=p_limit),'[]'),
  case when count(*)>p_limit then (jsonb_agg(jsonb_build_object('at',updated_at,'id',id) order by updated_at,id)->(p_limit-1)) else null end
 into rows,cursor from numbered n;
 return jsonb_build_object('items',rows,'next_cursor',cursor);
end$$;

create function public.admin_business_application_command_v1(p_id uuid,p_revision bigint,p_action text,
 p_response text,p_internal_note text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid; applicant uuid; a business_private.applications%rowtype; r business_private.receipts%rowtype;
 fingerprint text; oid uuid; result jsonb;
begin
 uid:=business_private.staff_actor(true);
 if p_id is null or p_revision is null or p_request_id is null or p_action is null
  or p_action not in ('approve','decline','request_changes','reopen')
  or length(btrim(coalesce(p_response,''))) not between 8 and 1000
  or length(btrim(coalesce(p_internal_note,''))) not between 8 and 2000 then
  raise exception using errcode='22023',message='Decision, applicant response and internal rationale required'; end if;
 -- One order for staff and applicant writes: staff identity -> business identity ->
 -- application. Reopening immediately revokes organization access in this transaction.
 perform pg_advisory_xact_lock(hashtextextended('business-review:'||uid||':'||p_request_id,0));
 select applicant_id into applicant from business_private.applications where id=p_id and submission>0;
 if applicant is null then raise exception using errcode='P0002',message='Application unavailable'; end if;
 perform 1 from business_private.accounts where id=applicant for update;
 select * into a from business_private.applications where id=p_id for update;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array('review',p_id,p_revision,p_action,btrim(p_response),btrim(p_internal_note))::text,'UTF8')),'hex');
 select * into r from business_private.receipts where actor_id=uid and request_id=p_request_id;
 if found then
  if r.fingerprint<>fingerprint then raise exception using errcode='22023',message='Retry key belongs to a different command'; end if;
  return jsonb_build_object('outcome',r.outcome,'application',business_private.item(p_id,true),'replayed',true);
 end if;
 if p_revision is distinct from a.revision then raise exception using errcode='PT409',message='Application changed; reload first'; end if;
 if (p_action='reopen' and a.state not in ('approved','declined'))
   or (p_action<>'reopen' and a.state<>'pending') then
  raise exception using errcode='55000',message='Decision is not available in this state'; end if;
 if p_action='approve' then
  if not exists(select 1 from auth.users u join business_private.accounts b on b.id=u.id
    where u.id=applicant and u.role='doji_business' and u.raw_app_meta_data->>'account_type'='business'
    and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()) and not b.disabled)
    or exists(select 1 from public.profiles where id=applicant) or exists(select 1 from public.admin_employees where id=applicant) then
   raise exception using errcode='42501',message='Applicant is not eligible for approval'; end if;
  insert into business_private.organizations(application_id,status,approved_submission) values(a.id,'active',a.submission)
   on conflict(application_id) do update set status='active',approved_submission=excluded.approved_submission returning id into oid;
  insert into business_private.memberships values(oid,applicant,'owner') on conflict do nothing;
 elsif p_action='reopen' then
  update business_private.organizations set status='suspended' where application_id=a.id;
 end if;
 a.state:=case p_action when 'approve' then 'approved' when 'decline' then 'declined' else 'changes_requested' end;
 a.revision:=a.revision+1;
 update business_private.applications set state=a.state,revision=a.revision,response=btrim(p_response),updated_at=clock_timestamp() where id=a.id;
 insert into business_private.history(application_id,revision,actor_id,actor_kind,action,response,internal_note)
 values(a.id,a.revision,uid,'employee',p_action,btrim(p_response),btrim(p_internal_note));
 insert into public.admin_audit_log(actor_id,actor_role,action,entity_type,entity_id,reason,request_id,metadata)
 values(uid,public.admin_current_operator_role(),'business.application.'||p_action,'business_application',a.id::text,
  btrim(p_internal_note),p_request_id::text,jsonb_build_object('revision',a.revision,'submission',a.submission));
 result:=jsonb_build_object('id',a.id,'revision',a.revision,'state',a.state,'action',p_action);
 insert into business_private.receipts values(uid,p_request_id,fingerprint,a.id,result);
 if (select realtime_enabled from business_private.settings where singleton) then
 perform public.enqueue_domain_event('moderation:global','moderation.business.updated',a.id,
  jsonb_build_object('applicationId',a.id,'sendPush',false),'business:staff:'||a.id||':'||a.revision);
 perform public.enqueue_domain_event('business:'||applicant||':events','business.application.updated',a.id,
  jsonb_build_object('applicationId',a.id,'applicantId',applicant,'sendPush',false),'business:applicant:'||a.id||':'||a.revision);
 end if;
 return jsonb_build_object('outcome',result,'application',business_private.item(a.id,true),'replayed',false);
end$$;

-- Explicit grants in the same transaction avoid the default PUBLIC EXECUTE window.
revoke all on all functions in schema business_private from public,anon,authenticated,doji_employee,doji_business,service_role;
revoke all on function public.get_business_application_v1(),public.get_business_workspace_v1(),
 public.business_application_command_v1(text,bigint,jsonb,text,text,uuid),
 public.get_admin_business_application_v1(uuid),public.get_admin_business_applications_page_v1(text,integer,timestamptz,uuid),
 public.admin_business_application_command_v1(uuid,bigint,text,text,text,uuid)
 from public,anon,authenticated,doji_employee,doji_business,service_role;
grant execute on function public.get_business_application_v1(),public.get_business_workspace_v1(),
 public.business_application_command_v1(text,bigint,jsonb,text,text,uuid) to doji_business;
grant execute on function public.get_admin_business_application_v1(uuid),
 public.get_admin_business_applications_page_v1(text,integer,timestamptz,uuid),
 public.admin_business_application_command_v1(uuid,bigint,text,text,text,uuid) to doji_employee;

-- NOINHERIT does not remove PUBLIC access. Refuse unknown effective application
-- grants rather than repairing them by changing member permissions.
do $$declare exposed text; begin
 select string_agg(p.oid::regprocedure::text,', ') into exposed
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prokind='f'
  and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
  and has_function_privilege('doji_business',p.oid,'execute')
  and p.oid<>all(array['public.get_business_application_v1()'::regprocedure,
   'public.get_business_workspace_v1()'::regprocedure,
   'public.business_application_command_v1(text,bigint,jsonb,text,text,uuid)'::regprocedure]::oid[])
  and not exists(select 1 from (values
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
   where p.oid=to_regprocedure('public.'||signature) and md5(p.prosrc)=source_hash and not p.prosecdef
    and p.prorettype=to_regtype(return_type) and p.provolatile::text=volatility
    and p.prolang in(select oid from pg_language where lanname in('sql','plpgsql')));
 if exposed is not null then raise exception 'Business isolation preflight: unexpected RPC access: %',exposed; end if;
 select string_agg(c.oid::regclass::text,', ') into exposed from pg_class c
 join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','storage','business_private')
  and c.relkind in('r','v','m','p','f')
  and has_table_privilege('doji_business',c.oid,'select,insert,update,delete,truncate,references,trigger');
 if exposed is not null then raise exception 'Business isolation preflight: unexpected table access: %',exposed; end if;
end$$;
commit;
