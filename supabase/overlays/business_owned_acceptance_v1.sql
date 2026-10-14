-- Separately gated business acceptance only. No public-registration policy change.
-- Configure the one approved email's existing server-derived HMAC, never raw email.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create table business_session_private.owned_auth_acceptance (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 scope_hash text check(scope_hash ~ '^[a-f0-9]{64}$'),
 identity_hmac text check(identity_hmac ~ '^[a-f0-9]{64}$'),
 started_at timestamptz,
 expires_at timestamptz,
 reserved_at timestamptz,
 reservation_hash text check(reservation_hash ~ '^[a-f0-9]{64}$'),
 agreement_hmac text check(agreement_hmac ~ '^[a-f0-9]{64}$'),
 check(not enabled or (scope_hash is not null and identity_hmac is not null
  and started_at is not null and expires_at is not null
  and expires_at>started_at and expires_at<=started_at+interval '2 hours')),
 check((reserved_at is null)=(reservation_hash is null)
  and (reserved_at is null)=(agreement_hmac is null))
);
insert into business_session_private.owned_auth_acceptance default values;
alter table business_session_private.owned_auth_acceptance enable row level security;
revoke all on business_session_private.owned_auth_acceptance from public,anon,authenticated,
 service_role,doji_employee,doji_business,doji_identity_resolver,doji_business_session;

-- Same first lock as session/reset commands. No connection survives provider I/O.
create function business_session_private.admit_owned_acceptance_v1(
 p_scope text,p_action text,p_attempt text,p_identity text,p_network text
) returns jsonb language plpgsql security definer set search_path=''
set lock_timeout='1s' set statement_timeout='3s' as $$
begin
 perform business_session_private.owned_auth_lock_v1(p_scope);
 if not exists(select 1 from business_session_private.owned_auth_acceptance
  where singleton and enabled and scope_hash=p_scope and identity_hmac=p_identity
   and started_at<=clock_timestamp() and expires_at>clock_timestamp()) then
  return jsonb_build_object('state','denied');end if;
 return business_session_private.admit_owned_auth_v1(p_scope,p_action,p_attempt,p_identity,p_network);
end$$;

-- Exactly one provider-create dispatch across instances/retries. Never refund an
-- uncertain result, reuse the public pilot counter, or provision a principal here.
create function business_session_private.reserve_owned_acceptance_v1(
 p_scope text,p_identity text,p_attempt text,p_agreement text
) returns boolean language plpgsql security definer set search_path=''
set lock_timeout='1s' set statement_timeout='3s' as $$
begin
 perform business_session_private.owned_auth_lock_v1(p_scope);
 if p_attempt is null or p_attempt !~ '^[a-f0-9]{64}$'
  or p_agreement is null or p_agreement !~ '^[a-f0-9]{64}$' then return false;end if;
 update business_session_private.owned_auth_acceptance
  set reserved_at=clock_timestamp(),reservation_hash=p_attempt,agreement_hmac=p_agreement
  where singleton and enabled and scope_hash=p_scope and identity_hmac=p_identity
   and started_at<=clock_timestamp() and expires_at>clock_timestamp() and reserved_at is null;
 return found;
end$$;
revoke all on function business_session_private.admit_owned_acceptance_v1(text,text,text,text,text),
 business_session_private.reserve_owned_acceptance_v1(text,text,text,text)
 from public,anon,authenticated,service_role,doji_employee,doji_business,doji_identity_resolver;
grant execute on function business_session_private.admit_owned_acceptance_v1(text,text,text,text,text),
 business_session_private.reserve_owned_acceptance_v1(text,text,text,text) to doji_business_session;
commit;
