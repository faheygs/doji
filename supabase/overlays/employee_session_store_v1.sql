-- LOCAL CANDIDATE ONLY. Not in the migration queue; no deployed login uses this.
-- Short transactions only: no database lock spans a provider HTTP request.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create role doji_employee_session nologin noinherit;
create schema employee_session_private;
revoke all on schema employee_session_private from public;
create table employee_session_private.settings (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 scope_hash text check(scope_hash ~ '^[a-f0-9]{64}$'),
 generation uuid not null default gen_random_uuid(),
 flow_limit integer not null default 100 check(flow_limit between 1 and 1000),
 session_limit integer not null default 100 check(session_limit between 1 and 1000)
);
insert into employee_session_private.settings default values;
create table employee_session_private.records (
 kind text not null check(kind in ('flow','session')),
 key_hash text not null check(key_hash ~ '^[a-f0-9]{64}$'),
 generation uuid not null,
 envelope text not null check(length(envelope) between 40 and 50000 and envelope ~ '^[A-Za-z0-9_-]+$'),
 expires_at timestamptz not null,
 lease_hash text check(lease_hash ~ '^[a-f0-9]{64}$'),
 lease_until timestamptz,
 primary key(kind,key_hash),
 check((lease_hash is null)=(lease_until is null)),
 check(kind='session' or lease_hash is null)
);
create index employee_session_expiry on employee_session_private.records(kind,expires_at);
revoke all on all tables in schema employee_session_private from public;
alter table employee_session_private.settings enable row level security;
alter table employee_session_private.records enable row level security;

create function employee_session_private.execute_store(
 p_scope text,p_op text,p_kind text,p_key text,p_value text default null,
 p_ttl_ms integer default null,p_lease text default null,p_expected text default null
) returns jsonb language plpgsql security definer set search_path=''
set lock_timeout='1s' set statement_timeout='3s' as $$
declare cfg employee_session_private.settings%rowtype;
 r employee_session_private.records%rowtype;
 cap integer; stamp timestamptz;
begin
 if p_kind is null or p_kind not in ('flow','session') or p_key is null
  or p_key !~ '^[a-f0-9]{64}$' or p_scope is null or p_scope !~ '^[a-f0-9]{64}$'
  or p_op is null or p_op not in ('put','peek','take','acquire','replace','remove','release') then
  raise exception using errcode='22023',message='Invalid session operation'; end if;
 if p_op='put' then
  select * into cfg from employee_session_private.settings where singleton for update;
 else
  select * into cfg from employee_session_private.settings where singleton for share;
 end if;
 if not cfg.enabled or cfg.scope_hash is distinct from p_scope then
  raise exception using errcode='42501',message='Session store disabled'; end if;
 stamp:=clock_timestamp();
 if p_op='put' then
  cap:=case when p_kind='flow' then cfg.flow_limit else cfg.session_limit end;
  if p_value is null or length(p_value) not between 40 and 50000
   or p_value !~ '^[A-Za-z0-9_-]+$' or p_ttl_ms is null or p_ttl_ms<1
   or p_ttl_ms>(case when p_kind='flow' then 300000 else 28800000 end) then
   raise exception using errcode='22023',message='Invalid session envelope'; end if;
  -- Bounded opportunistic expiry cleanup; no scheduled polling.
  delete from employee_session_private.records where (kind,key_hash) in
   (select kind,key_hash from employee_session_private.records where kind=p_kind
     and expires_at<=stamp order by expires_at limit 32);
  if (select count(*) from employee_session_private.records where kind=p_kind)>=cap then
   return jsonb_build_object('state','capacity'); end if;
  insert into employee_session_private.records(kind,key_hash,generation,envelope,expires_at)
   values(p_kind,p_key,cfg.generation,p_value,stamp+p_ttl_ms*interval '1 millisecond')
   on conflict do nothing;
  if not found then return jsonb_build_object('state','conflict'); end if;
  return jsonb_build_object('state','ok');
 end if;
 if (p_kind='flow' and p_op not in ('peek','take'))
  or (p_kind='session' and p_op not in ('acquire','replace','remove','release')) then
  raise exception using errcode='22023',message='Invalid session operation'; end if;
 if p_kind='session' and (p_lease is null or p_lease !~ '^[a-f0-9]{64}$') then
  raise exception using errcode='22023',message='Invalid session lease'; end if;
 select * into r from employee_session_private.records where kind=p_kind and key_hash=p_key for update;
 if not found then return jsonb_build_object('state','missing'); end if;
 -- Re-read the clock after any row-lock wait.
 stamp:=clock_timestamp();
 if r.expires_at<=stamp or r.generation<>cfg.generation then
  delete from employee_session_private.records where kind=p_kind and key_hash=p_key;
  return jsonb_build_object('state','missing'); end if;
 if p_kind='flow' then
  if p_op='take' then
   if p_expected is distinct from r.envelope then return jsonb_build_object('state','missing'); end if;
   delete from employee_session_private.records where kind=p_kind and key_hash=p_key;
  end if;
  return jsonb_build_object('state','ok','value',r.envelope);
 end if;
 -- An expired holder may have rotated a provider token before dying. Never
 -- transfer ownership of that uncertain session; require fresh authentication.
 if r.lease_until<=stamp then
  delete from employee_session_private.records where kind=p_kind and key_hash=p_key;
  return jsonb_build_object('state','missing'); end if;
 if p_op='acquire' then
  if r.lease_hash is not null then return jsonb_build_object('state','busy'); end if;
  update employee_session_private.records set lease_hash=p_lease,lease_until=stamp+interval '30 seconds'
   where kind=p_kind and key_hash=p_key;
  return jsonb_build_object('state','ok','value',r.envelope);
 end if;
 if r.lease_hash is distinct from p_lease then return jsonb_build_object('state','missing'); end if;
 if p_op='remove' then
  delete from employee_session_private.records where kind=p_kind and key_hash=p_key;
 elsif p_op='release' then
  update employee_session_private.records set lease_hash=null,lease_until=null where kind=p_kind and key_hash=p_key;
 elsif p_op='replace' then
  if p_value is null or length(p_value) not between 40 and 50000 or p_value !~ '^[A-Za-z0-9_-]+$' then
   raise exception using errcode='22023',message='Invalid session envelope'; end if;
  update employee_session_private.records set envelope=p_value where kind=p_kind and key_hash=p_key;
 end if;
 return jsonb_build_object('state','ok');
end$$;
revoke all on all functions in schema employee_session_private from public;
grant usage on schema employee_session_private to doji_employee_session;
grant execute on function employee_session_private.execute_store(text,text,text,text,text,integer,text,text) to doji_employee_session;
-- No authenticator membership, login/password, service-role grant, Auth access,
-- member function/policy modification or event producer is installed here.
commit;
