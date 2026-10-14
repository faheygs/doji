-- LOCAL ONLY. Apply AFTER business_owned_auth_guard_v1 in the isolated test DB.
-- Uses its default-disabled scope gate; no existing function/role/policy changes.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create table business_session_private.owned_auth_reset_links (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
 reset_id text not null unique check(reset_id ~ '^password_reset_[A-Za-z0-9]{1,80}$'),
 principal uuid not null references portal_identity_private.principals(id),
 envelope text not null check(length(envelope) between 40 and 12000 and envelope ~ '^[A-Za-z0-9_-]+$'),
 expires_at timestamptz not null,
 operation_hash text unique check(operation_hash ~ '^[a-f0-9]{64}$'),
 completed_at timestamptz,
 success_event text unique check(success_event ~ '^event_[A-Za-z0-9]{1,80}$')
);
create index owned_auth_reset_link_expiry on business_session_private.owned_auth_reset_links(expires_at);
alter table business_session_private.owned_auth_reset_links enable row level security;
revoke all on business_session_private.owned_auth_reset_links from public,anon,authenticated,service_role,doji_employee,doji_business,doji_identity_resolver,doji_business_session;

create function business_session_private.put_owned_reset_link_v1(
 p_scope text,p_hash text,p_reset text,p_value text,p_expires bigint,p_issuer text,p_audience text,p_subject text
) returns jsonb language plpgsql security definer set search_path=''
set lock_timeout='1s' set statement_timeout='3s' as $$
declare target uuid; stamp timestamptz:=clock_timestamp(); expiry timestamptz;
 r business_session_private.owned_auth_reset_links%rowtype;
begin
 perform business_session_private.owned_auth_lock_v1(p_scope);
 target:=business_session_private.owned_auth_principal_v1(p_issuer,p_audience,p_subject);
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_reset is null or p_reset !~ '^password_reset_[A-Za-z0-9]{1,80}$'
  or p_value is null or length(p_value) not between 40 and 12000 or p_value !~ '^[A-Za-z0-9_-]+$' or p_expires is null
  or p_expires<=extract(epoch from stamp)*1000 or p_expires>extract(epoch from stamp+interval '24 hours')*1000
 then raise exception using errcode='22023',message='Invalid reset link';end if;
 expiry:=to_timestamp(p_expires::double precision/1000);
 select * into r from business_session_private.owned_auth_reset_links where token_hash=p_hash or reset_id=p_reset;
 if found then
  if r.token_hash=p_hash and r.reset_id=p_reset and r.principal=target and r.envelope=p_value and r.expires_at=expiry then
   return jsonb_build_object('state','ok');end if;
  return jsonb_build_object('state','denied');
 end if;
 -- Pending operations retain their metadata regardless of token expiry. Completed
 -- evidence lasts seven days. Cleanup is on demand and strictly bounded.
 delete from business_session_private.owned_auth_reset_links where token_hash in (
  select token_hash from business_session_private.owned_auth_reset_links
  where (operation_hash is null and completed_at is null and expires_at<=stamp)
   or completed_at<=stamp-interval '7 days' order by expires_at limit 32);
 if (select count(*) from business_session_private.owned_auth_reset_links)>=128 then
  return jsonb_build_object('state','limited');end if;
 insert into business_session_private.owned_auth_reset_links(token_hash,reset_id,principal,envelope,expires_at)
  values(p_hash,p_reset,target,p_value,expiry);
 return jsonb_build_object('state','ok');
end$$;

create function business_session_private.get_owned_reset_link_v1(p_scope text,p_hash text)
returns jsonb language plpgsql security definer set search_path=''
set lock_timeout='1s' set statement_timeout='3s' as $$
declare r business_session_private.owned_auth_reset_links%rowtype;
begin
 perform business_session_private.owned_auth_lock_v1(p_scope);
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception using errcode='22023',message='Invalid reset link';end if;
 select * into r from business_session_private.owned_auth_reset_links where token_hash=p_hash and expires_at>clock_timestamp();
 if not found then return jsonb_build_object('state','missing');end if;
 return jsonb_build_object('state','ok','envelope',r.envelope);
end$$;

-- Bind the verified link to the fence in ONE transaction before provider dispatch.
create function business_session_private.begin_owned_reset_link_v1(
 p_scope text,p_hash text,p_operation text,p_issuer text,p_audience text,p_subject text
) returns jsonb language plpgsql security definer set search_path=''
set lock_timeout='1s' set statement_timeout='3s' as $$
declare target uuid; r business_session_private.owned_auth_reset_links%rowtype; result jsonb;
begin
 perform business_session_private.owned_auth_lock_v1(p_scope);
 target:=business_session_private.owned_auth_principal_v1(p_issuer,p_audience,p_subject);
 if p_operation is null or p_operation !~ '^[a-f0-9]{64}$' then raise exception using errcode='22023',message='Invalid reset operation';end if;
 select * into r from business_session_private.owned_auth_reset_links where token_hash=p_hash;
 if not found or r.principal<>target or r.expires_at<=clock_timestamp()
  or exists(select 1 from business_session_private.owned_auth_reset_links where operation_hash=p_operation and token_hash<>p_hash)
  or (r.operation_hash is not null and r.operation_hash<>p_operation) then return jsonb_build_object('state','denied');end if;
 if r.completed_at is not null then
  return jsonb_build_object('state',case when r.operation_hash=p_operation then 'complete' else 'denied' end);end if;
 result:=business_session_private.begin_owned_reset_v1(p_scope,p_operation,p_issuer,p_audience,p_subject);
 if result->>'state'='started' then
  update business_session_private.owned_auth_reset_links set operation_hash=p_operation where token_hash=p_hash;
 end if;
 return result;
end$$;

-- Confirmed provider response OR an exact signed success event may call this.
-- Completed-link receipts prevent late events revoking newer sessions, even after
-- the guard's shorter completed-receipt retention has elapsed.
create function business_session_private.complete_owned_reset_link_v1(
 p_scope text,p_operation text,p_issuer text,p_audience text,p_subject text
) returns jsonb language plpgsql security definer set search_path=''
set lock_timeout='1s' set statement_timeout='3s' as $$
declare target uuid; r business_session_private.owned_auth_reset_links%rowtype; result jsonb;
begin
 perform business_session_private.owned_auth_lock_v1(p_scope);
 target:=business_session_private.owned_auth_principal_v1(p_issuer,p_audience,p_subject);
 select * into r from business_session_private.owned_auth_reset_links where operation_hash=p_operation;
 if not found or r.principal<>target then return jsonb_build_object('state','denied');end if;
 if r.completed_at is not null then return jsonb_build_object('state','complete');end if;
 result:=business_session_private.complete_owned_reset_v1(p_scope,p_operation,p_issuer,p_audience,p_subject);
 if result->>'state'='complete' then
  update business_session_private.owned_auth_reset_links set completed_at=clock_timestamp() where token_hash=r.token_hash;
 end if;
 return result;
end$$;

create function business_session_private.reconcile_owned_reset_link_v1(
 p_scope text,p_event text,p_reset text,p_issuer text,p_audience text,p_subject text
) returns jsonb language plpgsql security definer set search_path=''
set lock_timeout='1s' set statement_timeout='3s' as $$
declare target uuid; r business_session_private.owned_auth_reset_links%rowtype; result jsonb;
begin
 perform business_session_private.owned_auth_lock_v1(p_scope);
 if p_event is null or p_event !~ '^event_[A-Za-z0-9]{1,80}$' or p_reset is null or p_reset !~ '^password_reset_[A-Za-z0-9]{1,80}$'
 then raise exception using errcode='22023',message='Invalid reset evidence';end if;
 select * into r from business_session_private.owned_auth_reset_links where reset_id=p_reset;
 if not found then return jsonb_build_object('state','ignored');end if;
 target:=business_session_private.owned_auth_principal_v1(p_issuer,p_audience,p_subject);
 if target<>r.principal or exists(select 1 from business_session_private.owned_auth_reset_links where success_event=p_event and token_hash<>r.token_hash)
 then return jsonb_build_object('state','denied');end if;
 if r.completed_at is not null then return jsonb_build_object('state','complete');end if;
 if r.operation_hash is null then
  -- Provider consumed this link outside our reset coordinator: burn it, but do
  -- not invent an operation, revoke local sessions, or release another fence.
  update business_session_private.owned_auth_reset_links set completed_at=clock_timestamp(),success_event=p_event where token_hash=r.token_hash;
  return jsonb_build_object('state','complete');
 end if;
 result:=business_session_private.complete_owned_reset_link_v1(p_scope,r.operation_hash,p_issuer,p_audience,p_subject);
 if result->>'state'='complete' then
  update business_session_private.owned_auth_reset_links set success_event=p_event where token_hash=r.token_hash;
 end if;
 return result;
end$$;

revoke all on function business_session_private.put_owned_reset_link_v1(text,text,text,text,bigint,text,text,text),
 business_session_private.get_owned_reset_link_v1(text,text),
 business_session_private.begin_owned_reset_link_v1(text,text,text,text,text,text),
 business_session_private.complete_owned_reset_link_v1(text,text,text,text,text),
 business_session_private.reconcile_owned_reset_link_v1(text,text,text,text,text,text)
 from public,anon,authenticated,service_role,doji_employee,doji_business,doji_identity_resolver,doji_business_session;
grant execute on function business_session_private.put_owned_reset_link_v1(text,text,text,text,bigint,text,text,text),
 business_session_private.get_owned_reset_link_v1(text,text),
 business_session_private.begin_owned_reset_link_v1(text,text,text,text,text,text),
 business_session_private.complete_owned_reset_link_v1(text,text,text,text,text),
 business_session_private.reconcile_owned_reset_link_v1(text,text,text,text,text,text) to doji_business_session;
commit;
