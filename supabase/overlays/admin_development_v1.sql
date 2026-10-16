-- STAGING ONLY. Assemble with scripts/build-admin-development-sql.mts.
-- No credentials, personas, login roles or enabled gates are provisioned here.
begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
do $$begin
 if not exists(select 1 from portal_identity_private.realms where realm='employee'
  and audience='client_01M3T5GJM7JZVQQ7CGHNJD0QMZ'
  and issuer='https://api.workos.com/user_management/client_01M3T5GJM7JZVQQ7CGHNJD0QMZ') then
  raise exception 'Exact staging employee realm required';
 end if;
end$$;
create role doji_staging_development nologin noinherit;
create schema admin_development_private;
revoke all on schema admin_development_private from public,anon,authenticated,service_role,doji_employee,doji_business,doji_employee_application,doji_identity_resolver;
create table admin_development_private.settings (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false
);
insert into admin_development_private.settings values(true,false);
create table admin_development_private.personas (
 id uuid primary key references portal_identity_private.staff_actors(id),
 label text not null check(length(label) between 1 and 100), enabled boolean not null default false
);
create table admin_development_private.credentials (
 id uuid primary key, developer text not null check(length(developer) between 1 and 160),
 token_hash text unique not null check(token_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null, enabled boolean not null default false
);
create table admin_development_private.grants (
 credential_id uuid references admin_development_private.credentials(id),
 persona_id uuid references admin_development_private.personas(id),
 primary key(credential_id,persona_id)
);
create table admin_development_private.routes (
 name text primary key, target regprocedure not null, fields text[] not null,
 types text[] not null, defaults jsonb not null,
 check(cardinality(fields)=cardinality(types))
);
create table admin_development_private.context (
 pid integer not null, transaction_id bigint not null,
 credential_id uuid not null references admin_development_private.credentials(id),
 persona_id uuid not null references admin_development_private.personas(id),
 primary key(pid,transaction_id)
);
create table admin_development_private.audit (
 id bigint generated always as identity primary key, occurred_at timestamptz not null default clock_timestamp(),
 credential_id uuid not null references admin_development_private.credentials(id),
 developer text not null, persona_id uuid references admin_development_private.personas(id),
 request_id uuid not null, operation text not null, argument_hash text not null,
 outcome text not null check(outcome in ('allowed','denied','rejected')), code text
);
create table admin_development_private.restore (
 signature text primary key, original text not null, installed_hash text not null
);
do $$declare t text;begin
 foreach t in array array['settings','personas','credentials','grants','routes','context','audit','restore'] loop
  execute format('alter table admin_development_private.%I enable row level security',t);
 end loop;
end$$;
revoke all on all tables in schema admin_development_private from public,anon,authenticated,service_role,doji_employee,doji_business,doji_employee_application,doji_identity_resolver;
revoke all on all sequences in schema admin_development_private from public,anon,authenticated,service_role,doji_employee,doji_business,doji_employee_application,doji_identity_resolver;

-- Development authority is an unforgeable private transaction context, not aal2.
-- Hosted/member callers retain the original assurance condition exactly.
create function admin_development_private.assurance_v1(p_aal text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(p_aal='aal2',false) or coalesce((
  p_aal='staging_development' and session_user='doji_staging_development_login'
  and exists(select 1 from admin_development_private.context c
    join admin_development_private.credentials k on k.id=c.credential_id
    join admin_development_private.grants g on g.credential_id=k.id and g.persona_id=c.persona_id
    join admin_development_private.personas p on p.id=c.persona_id
    join admin_development_private.settings s on s.singleton
    where c.pid=pg_backend_pid() and c.transaction_id=txid_current()
      and c.persona_id=auth.uid() and k.enabled and p.enabled and s.enabled
      and k.expires_at>statement_timestamp())
 ),false)
$$;
revoke all on function admin_development_private.assurance_v1(text) from public,anon,authenticated,service_role,doji_employee,doji_business,doji_employee_application,doji_identity_resolver;

-- The builder injects a fixed, code-owned route manifest and exact gate patches.
-- DOJI_DEVELOPMENT_MANIFEST
do $$begin
 if not exists(select 1 from admin_development_private.routes)
  or not exists(select 1 from admin_development_private.restore) then
  raise exception 'Reviewed development manifest required';end if;
end$$;

create function admin_development_private.invoke_v1(
 p_token_hash text,p_persona uuid,p_name text,p_args jsonb,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare k admin_development_private.credentials%rowtype; r admin_development_private.routes%rowtype;
 args jsonb; result jsonb; parameters text[]:=array[]::text[]; i integer; code text;
 target_schema text; target_name text;
 prior_claims text:=coalesce(current_setting('request.jwt.claims',true),'');
 prior_claim text:=coalesce(current_setting('request.jwt.claim',true),'');
 prior_sub text:=coalesce(current_setting('request.jwt.claim.sub',true),'');
 prior_role text:=coalesce(current_setting('request.jwt.claim.role',true),'');
 prior_email text:=coalesce(current_setting('request.jwt.claim.email',true),'');
begin
 if session_user<>'doji_staging_development_login' or p_token_hash is null
  or p_token_hash!~'^[a-f0-9]{64}$' or p_request_id is null then
  raise exception using errcode='42501',message='Development access denied';end if;
 perform 1 from admin_development_private.settings where singleton and enabled for share;
 if not found or not exists(select 1 from portal_identity_private.realms where realm='employee'
  and audience='client_01M3T5GJM7JZVQQ7CGHNJD0QMZ'
  and issuer='https://api.workos.com/user_management/client_01M3T5GJM7JZVQQ7CGHNJD0QMZ') then
  raise exception using errcode='42501',message='Development access denied';end if;
 select * into k from admin_development_private.credentials
  where token_hash=p_token_hash and enabled
    and expires_at>clock_timestamp() for share;
 if not found then raise exception using errcode='42501',message='Development access denied';end if;
 if p_name is null or length(p_name)>100 or p_args is null or jsonb_typeof(p_args)<>'object'
  or octet_length(p_args::text)>16000 then
  raise exception using errcode='22023',message='Invalid development request';end if;
 -- All persona selection comes from private grants, never arbitrary member IDs.
 if p_name='personas' and p_persona is null and p_args='{}'::jsonb then
  select jsonb_build_object('developer',k.developer,'personas',coalesce(jsonb_agg(
    jsonb_build_object('id',p.id,'label',p.label) order by p.label),'[]'::jsonb)) into result
   from (select p.id,p.label from admin_development_private.personas p
   join admin_development_private.grants g on g.persona_id=p.id and g.credential_id=k.id
   join public.admin_employees e on e.id=p.id and e.status='active'
   join portal_identity_private.principals principal on principal.id=p.id and principal.realm='employee' and principal.state='active'
   where p.enabled and not exists(select 1 from auth.users where id=p.id)
    and not exists(select 1 from public.profiles where id=p.id)
    and not exists(select 1 from business_private.accounts where id=p.id)
   order by p.label,p.id limit 25) p;
  return result;
 end if;
 begin
  if p_name='admin_set_employee_role_v1' then perform pg_advisory_xact_lock(92610001);end if;
  perform 1 from admin_development_private.grants g
   join admin_development_private.personas p on p.id=g.persona_id
   join portal_identity_private.staff_actors a on a.id=p.id and a.employee_principal_id=p.id and a.legacy_auth_id is null
   join portal_identity_private.principals principal on principal.id=p.id and principal.realm='employee' and principal.state='active'
   join public.admin_employees e on e.id=p.id and e.status='active'
   where g.credential_id=k.id and g.persona_id=p_persona and p.enabled
     and not exists(select 1 from auth.users where id=p.id)
     and not exists(select 1 from public.profiles where id=p.id)
     and not exists(select 1 from business_private.accounts where id=p.id)
   for share of g,p,a,principal,e;
  if not found then raise exception using errcode='42501',message='Persona unavailable';end if;
  select * into r from admin_development_private.routes where name=p_name;
  if not found then raise exception using errcode='42501',message='Operation unavailable';end if;
  args:=r.defaults||p_args;
  if (select count(*) from jsonb_object_keys(args))<>cardinality(r.fields) or not args ?& r.fields then
   raise exception using errcode='22023',message='Invalid arguments';end if;
  if args ? 'p_limit' and args->'p_limit'<>'null'::jsonb and
    (jsonb_typeof(args->'p_limit')<>'number' or (args->>'p_limit')!~'^[0-9]{1,2}$'
      or (args->>'p_limit')::int not between 1 and 50) then
   raise exception using errcode='22023',message='Invalid page size';end if;
  insert into admin_development_private.context values(pg_backend_pid(),txid_current(),k.id,p_persona);
  perform set_config('request.jwt.claim','',true);
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claim.role','',true);
  perform set_config('request.jwt.claim.email','',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_persona,'role','doji_employee',
    'aal','staging_development','developer',k.id)::text,true);
  if not public.admin_user_has_permission('portal.session') then
   raise exception using errcode='42501',message='Persona access denied';end if;
  select n.nspname,p.proname into strict target_schema,target_name from pg_proc p
   join pg_namespace n on n.oid=p.pronamespace where p.oid=r.target;
  for i in 1..cardinality(r.fields) loop
   parameters:=array_append(parameters,case when r.types[i]='jsonb'
    then format('($1->%L)',r.fields[i]) else format('($1->>%L)::%s',r.fields[i],r.types[i]) end);
  end loop;
  execute format('select to_jsonb(%I.%I(%s))',target_schema,target_name,array_to_string(parameters,',')) into result using args;
  code:=null;
 exception when others then
  -- A failed command rolls back its own changes before its denied attempt is recorded.
  -- Never expose SQL messages, credentials or request bodies in audit/client output.
  code:=sqlstate; result:=null;
 end;
 delete from admin_development_private.context where pid=pg_backend_pid() and transaction_id=txid_current();
 perform set_config('request.jwt.claims',prior_claims,true);
 perform set_config('request.jwt.claim',prior_claim,true);
 perform set_config('request.jwt.claim.sub',prior_sub,true);
 perform set_config('request.jwt.claim.role',prior_role,true);
 perform set_config('request.jwt.claim.email',prior_email,true);
 insert into admin_development_private.audit(credential_id,developer,persona_id,request_id,operation,argument_hash,outcome,code)
 values(k.id,k.developer,(select id from admin_development_private.personas where id=p_persona),p_request_id,p_name,
  encode(extensions.digest(p_args::text,'sha256'),'hex'),case when code is null then 'allowed'
    when code='42501' then 'denied' else 'rejected' end,code);
 return jsonb_build_object('ok',code is null,'result',result,'code',code);
end$$;
revoke all on function admin_development_private.invoke_v1(text,uuid,text,jsonb,uuid) from public,anon,authenticated,service_role,doji_employee,doji_business,doji_employee_application,doji_identity_resolver;
grant usage on schema admin_development_private to doji_staging_development;
grant execute on function admin_development_private.invoke_v1(text,uuid,text,jsonb,uuid) to doji_staging_development;
commit;
