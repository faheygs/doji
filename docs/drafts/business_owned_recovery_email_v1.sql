-- LOCAL PREPARATION ONLY. Separate approved release required. No member grants.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create table business_session_private.owned_auth_mail_settings (
 singleton boolean primary key default true check(singleton),
 enabled_until timestamptz
);
insert into business_session_private.owned_auth_mail_settings default values;
create table business_session_private.owned_auth_mail_reservations (
 ticket_hash text primary key check(ticket_hash ~ '^[a-f0-9]{64}$'),
 reserved_at timestamptz not null default clock_timestamp()
);
create index owned_auth_mail_time on business_session_private.owned_auth_mail_reservations(reserved_at);
alter table business_session_private.owned_auth_mail_settings enable row level security;
alter table business_session_private.owned_auth_mail_reservations enable row level security;
revoke all on business_session_private.owned_auth_mail_settings,business_session_private.owned_auth_mail_reservations
 from public,anon,authenticated,service_role,doji_employee,doji_business,doji_identity_resolver,doji_business_session;
create function business_session_private.reserve_owned_recovery_email_v1(p_scope text,p_ticket text)
returns jsonb language plpgsql security definer set search_path=''
set lock_timeout='1s' set statement_timeout='3s' as $$
declare stamp timestamptz:=clock_timestamp();
begin
 perform business_session_private.owned_auth_lock_v1(p_scope);
 if not exists(select 1 from business_session_private.owned_auth_mail_settings
  where singleton and enabled_until>stamp and enabled_until<=stamp+interval '24 hours')
 then return jsonb_build_object('state','disabled');end if;
 if p_ticket is null or p_ticket !~ '^[a-f0-9]{64}$' or not exists(
  select 1 from business_session_private.owned_auth_tickets where key_hash=p_ticket
  and action='recover' and expires_at>stamp and installed_key is null)
 then return jsonb_build_object('state','denied');end if;
 -- Never re-dispatch an already reserved ticket, even after an unknown outcome.
 if exists(select 1 from business_session_private.owned_auth_mail_reservations where ticket_hash=p_ticket)
 then return jsonb_build_object('state','spent');end if;
 delete from business_session_private.owned_auth_mail_reservations where ticket_hash in (
  select ticket_hash from business_session_private.owned_auth_mail_reservations
  where reserved_at<=stamp-interval '31 days' order by reserved_at limit 32);
 -- Rolling limits avoid midnight bursts. This reserves only a small portion of
 -- shared capacity; current account headroom must also be checked before enabling.
 if (select count(*) from business_session_private.owned_auth_mail_reservations)>=100
  or (select count(*) from business_session_private.owned_auth_mail_reservations
   where reserved_at>stamp-interval '24 hours')>=10
 then return jsonb_build_object('state','limited');end if;
 insert into business_session_private.owned_auth_mail_reservations(ticket_hash,reserved_at) values(p_ticket,stamp);
 return jsonb_build_object('state','reserved');
end$$;
revoke all on function business_session_private.reserve_owned_recovery_email_v1(text,text)
 from public,anon,authenticated,service_role,doji_employee,doji_business,doji_identity_resolver;
grant execute on function business_session_private.reserve_owned_recovery_email_v1(text,text) to doji_business_session;
commit;
