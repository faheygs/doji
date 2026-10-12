-- LOCAL PREPARATION ONLY. Separate shared-database release; default disabled.
-- No replacements of existing functions, member/employee tables, grants or policies.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create table business_session_private.owned_auth_settings (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 scope_hash text check(scope_hash ~ '^[a-f0-9]{64}$'),
 epoch bigint not null default 0 check(epoch>=0)
);
insert into business_session_private.owned_auth_settings default values;
create table business_session_private.owned_auth_buckets (
 kind text not null check(kind in ('global','identity','network')),
 key_hash text not null check(key_hash ~ '^[a-f0-9]{64}$'),
 started_at timestamptz not null,
 attempts integer not null check(attempts between 1 and 60),
 primary key(kind,key_hash)
);
create index owned_auth_bucket_expiry on business_session_private.owned_auth_buckets(started_at);
create table business_session_private.owned_auth_tickets (
 key_hash text primary key check(key_hash ~ '^[a-f0-9]{64}$'),
 action text not null check(action in ('signin','register','verify','mfa','recover','reset')),
 epoch bigint not null check(epoch>0),
 expires_at timestamptz not null,
 installed_key text check(installed_key ~ '^[a-f0-9]{64}$'),
 installed_principal uuid references portal_identity_private.principals(id),
 check((installed_key is null)=(installed_principal is null))
);
create index owned_auth_ticket_expiry on business_session_private.owned_auth_tickets(expires_at);
create table business_session_private.owned_auth_fences (
 principal uuid primary key references portal_identity_private.principals(id),
 epoch bigint not null check(epoch>0),
 pending_reset text check(pending_reset ~ '^[a-f0-9]{64}$')
);
create table business_session_private.owned_auth_resets (
 key_hash text primary key check(key_hash ~ '^[a-f0-9]{64}$'),
 principal uuid not null references portal_identity_private.principals(id),
 started_at timestamptz not null,
 completed_at timestamptz
);
create index owned_auth_reset_expiry on business_session_private.owned_auth_resets(completed_at)
 where completed_at is not null;
do $$declare t text; begin
 foreach t in array array['owned_auth_settings','owned_auth_buckets','owned_auth_tickets','owned_auth_fences','owned_auth_resets'] loop
  execute format('alter table business_session_private.%I enable row level security',t);
  execute format('revoke all on business_session_private.%I from public,anon,authenticated,service_role,doji_employee,doji_business,doji_identity_resolver,doji_business_session',t);
 end loop;
end$$;

-- All guard commands take this short, business-only lock FIRST. It serializes
-- admission/capacity and reset/install races; never hold it across provider HTTP.
create function business_session_private.owned_auth_lock_v1(p_scope text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if current_setting('transaction_isolation')<>'read committed' or p_scope is null
  or p_scope !~ '^[a-f0-9]{64}$' then raise exception using errcode='42501',message='Business authentication unavailable';end if;
 perform 1 from business_session_private.owned_auth_settings where singleton for update;
 if not exists(select 1 from business_session_private.owned_auth_settings where singleton and enabled and scope_hash=p_scope)
  or not exists(select 1 from business_session_private.settings where singleton and enabled and scope_hash=p_scope)
 then raise exception using errcode='42501',message='Business authentication unavailable';end if;
end$$;

-- Only the trusted business verifier may supply a provider subject. Never resolve
-- an email address or permit a member/employee fallback here.
create function business_session_private.owned_auth_principal_v1(p_issuer text,p_audience text,p_subject text)
returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if p_subject is null or p_subject !~ '^user_[A-Za-z0-9]+$' then
  raise exception using errcode='42501',message='Business identity unavailable';end if;
 perform 1 from portal_identity_private.realms r
 join portal_identity_private.identities i on i.realm=r.realm
 join portal_identity_private.principals p on p.id=i.principal_id and p.realm=i.realm
 where r.realm='business' and i.subject=p_subject for share of r,i,p;
 select p.id into target from portal_identity_private.realms r
 join portal_identity_private.identities i on i.realm=r.realm
 join portal_identity_private.principals p on p.id=i.principal_id and p.realm=i.realm
 where r.realm='business' and r.enabled and r.issuer=p_issuer and r.audience=p_audience
  and i.subject=p_subject and not i.revoked and p.state='active';
 if target is null then raise exception using errcode='42501',message='Business identity unavailable';end if;
 perform 1 from business_private.accounts where id=target and not disabled for share;
 if not found then raise exception using errcode='42501',message='Business identity unavailable';end if;
 return target;
end$$;

-- HMAC identity/network keys are derived on the server, not accepted from a browser.
-- All actions share budgets: changing endpoint cannot reset an account/IP budget.
-- Duplicate attempt IDs do not permit another provider call or increment budgets.
create function business_session_private.admit_owned_auth_v1(
 p_scope text,p_action text,p_attempt text,p_identity text,p_network text
) returns jsonb language plpgsql security definer set search_path=''
set lock_timeout='1s' set statement_timeout='3s' as $$
declare stamp timestamptz; k text; h text; cap integer; next_epoch bigint; missing integer:=0;
begin
 perform business_session_private.owned_auth_lock_v1(p_scope);
 if p_action is null or p_action not in ('signin','register','verify','mfa','recover','reset')
  or p_attempt is null or p_attempt !~ '^[a-f0-9]{64}$'
  or p_identity is null or p_identity !~ '^[a-f0-9]{64}$'
  or p_network is null or p_network !~ '^[a-f0-9]{64}$' then
  raise exception using errcode='22023',message='Invalid admission';end if;
 stamp:=clock_timestamp();
 delete from business_session_private.owned_auth_buckets where (kind,key_hash) in
  (select kind,key_hash from business_session_private.owned_auth_buckets where started_at<=stamp-interval '10 minutes' order by started_at limit 32);
 delete from business_session_private.owned_auth_tickets where key_hash in
  (select key_hash from business_session_private.owned_auth_tickets where expires_at<=stamp order by expires_at limit 32);
 if exists(select 1 from business_session_private.owned_auth_tickets where key_hash=p_attempt) then
  return jsonb_build_object('state','duplicate');end if;
 if (select count(*) from business_session_private.owned_auth_tickets)>=128 then
  return jsonb_build_object('state','limited');end if;
 foreach k in array array['global','identity','network'] loop
  h:=case k when 'global' then repeat('0',64) when 'identity' then p_identity else p_network end;
  cap:=case k when 'global' then 60 when 'identity' then 10 else 30 end;
  if exists(select 1 from business_session_private.owned_auth_buckets where kind=k and key_hash=h
   and started_at>stamp-interval '10 minutes' and attempts>=cap) then return jsonb_build_object('state','limited');end if;
  if not exists(select 1 from business_session_private.owned_auth_buckets where kind=k and key_hash=h) then missing:=missing+1;end if;
 end loop;
 if (select count(*) from business_session_private.owned_auth_buckets)+missing>256 then
  return jsonb_build_object('state','limited');end if;
 foreach k in array array['global','identity','network'] loop
  h:=case k when 'global' then repeat('0',64) when 'identity' then p_identity else p_network end;
  insert into business_session_private.owned_auth_buckets values(k,h,stamp,1)
   on conflict(kind,key_hash) do update set
    started_at=case when business_session_private.owned_auth_buckets.started_at<=stamp-interval '10 minutes' then stamp else business_session_private.owned_auth_buckets.started_at end,
    attempts=case when business_session_private.owned_auth_buckets.started_at<=stamp-interval '10 minutes' then 1 else business_session_private.owned_auth_buckets.attempts+1 end;
 end loop;
 update business_session_private.owned_auth_settings set epoch=epoch+1 where singleton returning epoch into next_epoch;
 insert into business_session_private.owned_auth_tickets(key_hash,action,epoch,expires_at)
  values(p_attempt,p_action,next_epoch,stamp+interval '5 minutes');
 return jsonb_build_object('state','allowed','ticket',p_attempt);
end$$;

-- Original signin/register admission ticket is carried in encrypted continuation
-- state across email/MFA. A newer verification ticket must NEVER replace it.
create function business_session_private.put_owned_session_v1(
 p_scope text,p_ticket text,p_key text,p_value text,p_ttl integer,
 p_issuer text,p_audience text,p_subject text,p_session text
) returns jsonb language plpgsql security definer set search_path=''
set lock_timeout='1s' set statement_timeout='3s' as $$
declare target uuid; t business_session_private.owned_auth_tickets%rowtype;
 f business_session_private.owned_auth_fences%rowtype; result jsonb;
begin
 perform business_session_private.owned_auth_lock_v1(p_scope);
 target:=business_session_private.owned_auth_principal_v1(p_issuer,p_audience,p_subject);
 select * into t from business_session_private.owned_auth_tickets where key_hash=p_ticket;
 if not found or t.action not in ('signin','register') or t.expires_at<=clock_timestamp() then
  return jsonb_build_object('state','denied');end if;
 select * into f from business_session_private.owned_auth_fences where principal=target;
 if found and (f.pending_reset is not null or t.epoch<=f.epoch) then
  return jsonb_build_object('state','denied');end if;
 if t.installed_key is not null then
  if t.installed_key=p_key and t.installed_principal=target and exists(
   select 1 from business_session_private.records where kind='session' and key_hash=p_key
    and business_principal=target and envelope=p_value and expires_at>clock_timestamp()) then
   return jsonb_build_object('state','ok');end if;
  return jsonb_build_object('state','denied');
 end if;
 result:=business_session_private.put_bound_session(p_scope,p_key,p_value,p_ttl,p_issuer,p_audience,p_subject,p_session);
 if result->>'state'='ok' then
  update business_session_private.owned_auth_tickets set installed_key=p_key,installed_principal=target where key_hash=p_ticket;
 end if;
 return result;
end$$;

-- Call only after resolving a valid, unexpired reset token to this exact provider
-- subject on the server. Commit before provider confirmation. Unknown provider
-- outcomes retain the fence; never auto-unlock on timeout, abort or elapsed time.
create function business_session_private.begin_owned_reset_v1(
 p_scope text,p_operation text,p_issuer text,p_audience text,p_subject text
) returns jsonb language plpgsql security definer set search_path=''
set lock_timeout='1s' set statement_timeout='3s' as $$
declare target uuid; r business_session_private.owned_auth_resets%rowtype; next_epoch bigint;
begin
 perform business_session_private.owned_auth_lock_v1(p_scope);
 if p_operation is null or p_operation !~ '^[a-f0-9]{64}$' then
  raise exception using errcode='22023',message='Invalid reset operation';end if;
 target:=business_session_private.owned_auth_principal_v1(p_issuer,p_audience,p_subject);
 select * into r from business_session_private.owned_auth_resets where key_hash=p_operation;
 if found then
  if r.principal<>target then return jsonb_build_object('state','denied');end if;
  return jsonb_build_object('state',case when r.completed_at is null then 'pending' else 'complete' end);
 end if;
 if exists(select 1 from business_session_private.owned_auth_fences where principal=target and pending_reset is not null) then
  return jsonb_build_object('state','pending');end if;
 -- Retain pending operations indefinitely for explicit reconciliation, bounded by
 -- hard capacity; do not evict uncertain reset evidence to make room.
 delete from business_session_private.owned_auth_resets where key_hash in
  (select key_hash from business_session_private.owned_auth_resets where completed_at<=clock_timestamp()-interval '24 hours' order by completed_at limit 32);
 if (select count(*) from business_session_private.owned_auth_resets)>=128 or
  (not exists(select 1 from business_session_private.owned_auth_fences where principal=target)
   and (select count(*) from business_session_private.owned_auth_fences)>=1000) then
  return jsonb_build_object('state','limited');end if;
 update business_session_private.owned_auth_settings set epoch=epoch+1 where singleton returning epoch into next_epoch;
 insert into business_session_private.owned_auth_fences values(target,next_epoch,p_operation)
  on conflict(principal) do update set epoch=excluded.epoch,pending_reset=excluded.pending_reset;
 insert into business_session_private.owned_auth_resets values(p_operation,target,clock_timestamp(),null);
 delete from business_session_private.records where kind='session' and business_principal=target;
 return jsonb_build_object('state','started');
end$$;

-- Reconcile using the same operation ID after confirmed provider success. A
-- repeated completion never revokes sessions created AFTER the first completion.
create function business_session_private.complete_owned_reset_v1(
 p_scope text,p_operation text,p_issuer text,p_audience text,p_subject text
) returns jsonb language plpgsql security definer set search_path=''
set lock_timeout='1s' set statement_timeout='3s' as $$
declare target uuid; r business_session_private.owned_auth_resets%rowtype; next_epoch bigint;
begin
 perform business_session_private.owned_auth_lock_v1(p_scope);
 target:=business_session_private.owned_auth_principal_v1(p_issuer,p_audience,p_subject);
 select * into r from business_session_private.owned_auth_resets where key_hash=p_operation;
 if not found or r.principal<>target then return jsonb_build_object('state','denied');end if;
 if r.completed_at is not null then return jsonb_build_object('state','complete');end if;
 if not exists(select 1 from business_session_private.owned_auth_fences where principal=target and pending_reset=p_operation) then
  return jsonb_build_object('state','denied');end if;
 update business_session_private.owned_auth_settings set epoch=epoch+1 where singleton returning epoch into next_epoch;
 update business_session_private.owned_auth_fences set epoch=next_epoch,pending_reset=null where principal=target;
 delete from business_session_private.records where kind='session' and business_principal=target;
 update business_session_private.owned_auth_resets set completed_at=clock_timestamp() where key_hash=p_operation;
 return jsonb_build_object('state','complete');
end$$;

revoke all on function business_session_private.owned_auth_lock_v1(text),
 business_session_private.owned_auth_principal_v1(text,text,text),
 business_session_private.admit_owned_auth_v1(text,text,text,text,text),
 business_session_private.put_owned_session_v1(text,text,text,text,integer,text,text,text,text),
 business_session_private.begin_owned_reset_v1(text,text,text,text,text),
 business_session_private.complete_owned_reset_v1(text,text,text,text,text)
 from public,anon,authenticated,service_role,doji_employee,doji_business,doji_identity_resolver,doji_business_session;
grant execute on function business_session_private.admit_owned_auth_v1(text,text,text,text,text),
 business_session_private.put_owned_session_v1(text,text,text,text,integer,text,text,text,text),
 business_session_private.begin_owned_reset_v1(text,text,text,text,text),
 business_session_private.complete_owned_reset_v1(text,text,text,text,text) to doji_business_session;
commit;
