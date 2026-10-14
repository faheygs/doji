-- LOCAL CANDIDATE ONLY; requires business_session_store_v1.sql. No provider hook
-- is configured by this script. Dashboard error behavior must be Deny.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create role doji_business_registration nologin noinherit;
alter table business_session_private.settings
 add column registration_enabled boolean not null default false,
 add column registration_until timestamptz,
 add column registration_limit integer not null default 10 check(registration_limit between 1 and 100),
 add column registrations_used integer not null default 0 check(registrations_used>=0);
create table business_session_private.registration_receipts (
 action_hash text primary key check(action_hash ~ '^[a-f0-9]{64}$'),
 payload_hmac text not null check(payload_hmac ~ '^[a-f0-9]{64}$'),
 reserved_at timestamptz not null default clock_timestamp()
);
alter table business_session_private.registration_receipts enable row level security;
revoke all on business_session_private.registration_receipts from public;
create function business_session_private.reserve_registration(p_scope text,p_action text,p_digest text)
returns boolean language plpgsql security definer set search_path=''
set lock_timeout='1s' set statement_timeout='3s' as $$
declare cfg business_session_private.settings%rowtype; prior text;
begin
 if p_scope is null or p_scope !~ '^[a-f0-9]{64}$' or p_action is null or p_action !~ '^[a-f0-9]{64}$'
  or p_digest is null or p_digest !~ '^[a-f0-9]{64}$' then return false; end if;
 select * into cfg from business_session_private.settings where singleton for update;
 if not cfg.enabled or not cfg.registration_enabled or cfg.scope_hash is distinct from p_scope
   or cfg.registration_until is null or cfg.registration_until<=clock_timestamp() then return false; end if;
 select payload_hmac into prior from business_session_private.registration_receipts where action_hash=p_action;
 if found then return prior=p_digest; end if;
 if cfg.registrations_used>=cfg.registration_limit then return false; end if;
 insert into business_session_private.registration_receipts(action_hash,payload_hmac) values(p_action,p_digest);
 update business_session_private.settings set registrations_used=registrations_used+1 where singleton;
 return true;
end$$;
revoke all on function business_session_private.reserve_registration(text,text,text) from public;
grant usage on schema business_session_private to doji_business_registration;
grant execute on function business_session_private.reserve_registration(text,text,text) to doji_business_registration;
-- Reservations are not refunded automatically after an ambiguous provider result.
-- No emails, email hashes, names, IP addresses or passwords are retained here.
commit;
