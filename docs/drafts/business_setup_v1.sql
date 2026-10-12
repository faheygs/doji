-- PREPARATION ONLY. No automatic migration, deployment, mail sender or activation.
-- Requires independent business application/read/identity contracts.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create table business_private.setup_settings (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false
);
insert into business_private.setup_settings(singleton) values(true);
create table business_private.brand_profiles (
 organization_id uuid primary key references business_private.organizations(id),
 revision bigint not null check(revision>0),
 approved_submission integer not null,
 details jsonb not null,
 completed_at timestamptz,
 updated_at timestamptz not null default clock_timestamp()
);
-- Separate namespace from application receipts. Contains no copy of logo bytes.
create table business_private.setup_receipts (
 actor_id uuid not null references business_private.accounts(id),
 request_id uuid not null,
 fingerprint text not null,
 organization_id uuid not null references business_private.organizations(id),
 revision bigint not null,
 action text not null check(action in ('save','complete')),
 created_at timestamptz not null default clock_timestamp(),
 primary key(actor_id,request_id)
);
do $$declare t text; begin
 foreach t in array array['setup_settings','brand_profiles','setup_receipts'] loop
  execute format('alter table business_private.%I enable row level security',t);
  execute format('revoke all on business_private.%I from public,anon,authenticated,doji_employee,doji_business,service_role,doji_identity_resolver',t);
 end loop;
end$$;

create function business_private.valid_brand_details(p jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare logo text; bytes bytea; width bigint; height bigint;
begin
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>40000
  or (select count(*) from jsonb_object_keys(p))<>5
  or not p ?& array['description','website','primary_color','secondary_color','logo']
  or exists(select 1 from jsonb_each(p) where jsonb_typeof(value)<>'string')
  or length(p->>'description')>300 or (p->>'description') ~ '[[:cntrl:]]'
  or length(p->>'website') not between 9 and 500
  or (p->>'website') !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*(:[0-9]{1,5})?(/[^[:space:]<>]*)?$'
  or (p->>'primary_color') !~ '^#[A-Fa-f0-9]{6}$'
  or (p->>'secondary_color') !~ '^#[A-Fa-f0-9]{6}$' then return false; end if;
 logo:=p->>'logo';
 if logo='' then return true; end if;
 -- Small, private inline PNG only. No SVG/HTML, remote URL, member bucket or
 -- cross-organization object reference. Browser upload is rasterized first.
 if length(logo)>32800 or logo !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' then return false; end if;
 bytes:=decode(substr(logo,23),'base64');
 if octet_length(bytes) not between 57 and 24576
  or encode(substring(bytes from 1 for 16),'hex')<>'89504e470d0a1a0a0000000d49484452'
  or encode(substring(bytes from octet_length(bytes)-11 for 12),'hex')<>'0000000049454e44ae426082' then return false; end if;
 width:=get_byte(bytes,16)::bigint*16777216+get_byte(bytes,17)*65536+get_byte(bytes,18)*256+get_byte(bytes,19);
 height:=get_byte(bytes,20)::bigint*16777216+get_byte(bytes,21)*65536+get_byte(bytes,22)*256+get_byte(bytes,23);
 return width between 1 and 512 and height between 1 and 512;
exception when others then return false;
end$$;

create function portal_identity_private.business_setup_v1(
 p_issuer text,p_audience text,p_subject text,p_session text,p_mfa boolean,
 p_action text,p_revision bigint,p_details jsonb,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; account business_private.accounts%rowtype;
 app business_private.applications%rowtype; org business_private.organizations%rowtype;
 profile business_private.brand_profiles%rowtype; receipt business_private.setup_receipts%rowtype;
 fingerprint text; defaults jsonb; outcome jsonb; replayed boolean:=false;
begin
 perform 1 from business_private.setup_settings where singleton and enabled for share;
 if not found then raise exception using errcode='42501',message='Business setup unavailable'; end if;
 perform 1 from portal_identity_private.business_read_settings where singleton and enabled for share;
 if not found then raise exception using errcode='42501',message='Business reads unavailable'; end if;
 select principal_id into strict uid from portal_identity_private.resolve_identity('business',p_issuer,p_audience,p_subject,p_session,p_mfa);
 perform business_private.assert_enabled();
 if p_action is null or p_action not in ('read','save','complete','workspace') then
  raise exception using errcode='22023',message='Invalid setup action'; end if;
 if p_action in ('complete','workspace') and p_mfa is distinct from true then
  raise exception using errcode='42501',message='Authenticator verification required'; end if;
 if exists(select 1 from public.profiles where id=uid) or exists(select 1 from public.admin_employees where id=uid) then
  raise exception using errcode='42501',message='Separate business identity required'; end if;
 -- Identity -> account -> application -> organization. Decisions/privacy use
 -- this same account lock; never upgrade a shared account lock on a write.
 if p_action in ('save','complete') then
  select * into account from business_private.accounts where id=uid for update;
 else select * into account from business_private.accounts where id=uid for share; end if;
 if account.id is null or account.disabled then raise exception using errcode='42501',message='Business access disabled'; end if;
 select * into app from business_private.applications where applicant_id=uid for share;
 if app.id is null or app.state<>'approved' then raise exception using errcode='42501',message='Approval required'; end if;
 select o.* into org from business_private.organizations o join business_private.memberships m on m.organization_id=o.id
 where o.application_id=app.id and o.status='active' and m.account_id=uid and m.role='owner' for share of o,m;
 if org.id is null then raise exception using errcode='42501',message='Approved organization required'; end if;
 select jsonb_build_object('description','','website',s.details->>'website','primary_color','#B83B15','secondary_color','#6C3BFF','logo','')
 into defaults from business_private.submissions s where s.application_id=app.id and s.submission=org.approved_submission;
 select * into profile from business_private.brand_profiles where organization_id=org.id;
 if p_action in ('save','complete') then
  if p_request_id is null or p_revision is null or p_revision<0
    or (p_action='save' and not business_private.valid_brand_details(p_details))
    or (p_action='complete' and p_details is not null) then
   raise exception using errcode='22023',message='Check business setup details'; end if;
  fingerprint:=md5(jsonb_build_array(p_action,p_revision,p_details)::text);
  select * into receipt from business_private.setup_receipts where actor_id=uid and request_id=p_request_id;
  if found then
   if receipt.fingerprint<>fingerprint or receipt.organization_id<>org.id then
    raise exception using errcode='22023',message='Request key already used'; end if;
   replayed:=true;
  else
   if p_revision<>coalesce(profile.revision,0) then raise exception using errcode='PT409',message='Business setup changed'; end if;
   if account.budget_at<clock_timestamp()-interval '1 hour' then account.budget_at:=clock_timestamp(); account.budget_used:=0; end if;
   if account.budget_used>=30 then raise exception using errcode='55000',message='Business command limit reached'; end if;
   update business_private.accounts set budget_at=account.budget_at,budget_used=account.budget_used+1 where id=uid;
   if p_action='complete' and (profile.revision is null or not business_private.valid_brand_details(profile.details)) then
    raise exception using errcode='22023',message='Save your business details first'; end if;
   insert into business_private.brand_profiles(organization_id,revision,approved_submission,details,completed_at)
   values(org.id,coalesce(profile.revision,0)+1,org.approved_submission,
    case when p_action='save' then p_details else profile.details end,
    case when p_action='complete' then clock_timestamp() when profile.approved_submission=org.approved_submission then profile.completed_at end)
   on conflict(organization_id) do update set revision=excluded.revision,approved_submission=excluded.approved_submission,
    details=excluded.details,completed_at=excluded.completed_at,updated_at=clock_timestamp()
   returning * into profile;
   insert into business_private.setup_receipts(actor_id,request_id,fingerprint,organization_id,revision,action)
    values(uid,p_request_id,fingerprint,org.id,profile.revision,p_action);
   if (select realtime_enabled from business_private.settings where singleton) then
    perform public.enqueue_domain_event('business:'||uid||':events','business.application.updated',app.id,
     jsonb_build_object('applicationId',app.id,'applicantId',uid,'sendPush',false),'business:setup:'||org.id||':'||profile.revision);
   end if;
  end if;
 elsif p_revision is not null or p_details is not null or p_request_id is not null then
  raise exception using errcode='22023',message='Invalid read arguments';
 end if;
 if p_action='workspace' and (profile.completed_at is null or profile.approved_submission<>org.approved_submission) then
  raise exception using errcode='PT409',message='Finish business setup first'; end if;
 outcome:=jsonb_build_object('organization_id',org.id,'application_id',app.id,'role','owner',
  'brand_name',(select details->>'brand_name' from business_private.submissions where application_id=app.id and submission=org.approved_submission),
  'revision',coalesce(profile.revision,0),'details',coalesce(profile.details,defaults),
  'setup_complete',profile.completed_at is not null and profile.approved_submission=org.approved_submission,
  'campaigns_enabled',false,'billing_enabled',false);
 return jsonb_build_object('profile',outcome,'replayed',replayed);
end$$;
revoke all on function business_private.valid_brand_details(jsonb),
 portal_identity_private.business_setup_v1(text,text,text,text,boolean,text,bigint,jsonb,uuid)
 from public,anon,authenticated,doji_employee,doji_business,service_role,doji_identity_resolver;
grant execute on function portal_identity_private.business_setup_v1(text,text,text,text,boolean,text,bigint,jsonb,uuid) to doji_identity_resolver;
commit;
