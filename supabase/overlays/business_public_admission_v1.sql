-- LOCAL CANDIDATE ONLY. Apply after business_applications_v1.sql and business_auth_v1.sql.
-- Public registration is NOT enabled by this draft. No member/Auth configuration changes.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create table business_private.public_auth_settings (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 registration_open boolean not null default false,
 -- Explicit expiry and lifetime reservations require a reviewed operating budget.
 admission_until timestamptz,
 registration_limit integer not null default 0 check(registration_limit between 0 and 100),
 email_limit integer not null default 0 check(email_limit between 0 and 250),
 daily_email_limit integer not null default 0 check(daily_email_limit between 0 and 50),
 registrations_used integer not null default 0 check(registrations_used>=0),
 emails_used integer not null default 0 check(emails_used>=0),
 day_at date not null default (now() at time zone 'UTC')::date,
 daily_emails_used integer not null default 0 check(daily_emails_used>=0),
 window_at timestamptz not null default clock_timestamp(),
 attempts integer not null default 0 check(attempts>=0)
);
insert into business_private.public_auth_settings(singleton) values(true);
-- Fixed storage, not one row for every attacker-supplied email. Hash collisions
-- conservatively share limits. No email/IP/token is stored in these counters.
create table business_private.public_auth_buckets (
 slot integer primary key check(slot between 0 and 4095),
 window_at timestamptz not null default clock_timestamp(),
 attempts integer not null default 0 check(attempts>=0),
 last_mail_at timestamptz
);
insert into business_private.public_auth_buckets(slot) select generate_series(0,4095);
alter table business_private.public_auth_settings enable row level security;
alter table business_private.public_auth_buckets enable row level security;
revoke all on business_private.public_auth_settings,business_private.public_auth_buckets
 from public,anon,authenticated,doji_employee,doji_business,service_role;

-- Called ONLY by the dedicated business handler after Siteverify, or after
-- authenticating a signed verification ticket. Never grant this to a browser.
create function public.claim_public_business_auth_v1(p_action text,p_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s business_private.public_auth_settings%rowtype; b business_private.public_auth_buckets%rowtype;
 u auth.users%rowtype; t timestamptz:=clock_timestamp(); denied jsonb:='{"allowed":false}'; k integer;
begin
 if p_action is null or p_action not in ('register','signin','resend','recover','verify') or p_email is null
  or length(p_email)>254 or p_email<>lower(btrim(p_email))
  or p_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then return denied; end if;
 -- One lock order for every action; exact reservations commit even if Auth/mail
 -- subsequently fails. Never automatically refund or retry ambiguous requests.
 select * into s from business_private.public_auth_settings where singleton for update;
 if not found or not s.enabled then return denied; end if;
 if s.window_at<=t-interval '1 hour' then s.window_at:=t; s.attempts:=0; end if;
 if s.attempts>=600 then return denied; end if;
 update business_private.public_auth_settings set window_at=s.window_at,attempts=s.attempts+1 where singleton;
 -- Capacity messages are global and evaluated BEFORE any identity lookup, so
 -- they cannot reveal whether the supplied address already owns an account.
 if p_action='register' and (not s.registration_open or s.admission_until is null or s.admission_until<=t
  or s.registrations_used>=s.registration_limit) then
  return jsonb_build_object('allowed',false,'reason','registration_paused');
 end if;
 if s.day_at<>(t at time zone 'UTC')::date then s.day_at:=(t at time zone 'UTC')::date; s.daily_emails_used:=0; end if;
 if p_action in ('register','resend','recover') and
  (s.emails_used>=s.email_limit or s.daily_emails_used>=s.daily_email_limit) then
  return jsonb_build_object('allowed',false,'reason','email_paused');
 end if;
 k:=(('x'||substr(md5(p_email),1,8))::bit(32)::bigint % 4096)::integer;
 select * into b from business_private.public_auth_buckets where slot=k for update;
 if not found then return denied; end if;
 if b.window_at<=t-interval '1 hour' then b.window_at:=t; b.attempts:=0; end if;
 if b.attempts>=30 then return denied; end if;
 update business_private.public_auth_buckets set window_at=b.window_at,attempts=b.attempts+1 where slot=k;
 select * into u from auth.users where lower(email)=p_email limit 1;
 if p_action='register' then
  if u.id is not null then return denied; end if;
 else
  if u.id is null or u.role is distinct from 'doji_business'
   or u.raw_app_meta_data->>'account_type' is distinct from 'business'
   or u.deleted_at is not null or u.banned_until>t
   or exists(select 1 from public.profiles where id=u.id)
   or exists(select 1 from public.admin_employees where id=u.id)
   or exists(select 1 from business_private.accounts where id=u.id and disabled)
   then return denied; end if;
  if p_action in ('signin','recover') and u.email_confirmed_at is null then return denied; end if;
  if p_action='resend' and u.email_confirmed_at is not null then return denied; end if;
 end if;
 if p_action in ('register','resend','recover') then
  if b.last_mail_at>t-interval '2 minutes' then return denied; end if;
  update business_private.public_auth_settings set emails_used=emails_used+1,
   day_at=s.day_at,daily_emails_used=s.daily_emails_used+1,
   registrations_used=registrations_used+case when p_action='register' then 1 else 0 end where singleton;
  update business_private.public_auth_buckets set last_mail_at=t where slot=k;
 end if;
 return jsonb_build_object('allowed',true,'user_id',u.id);
end$$;
revoke all on function public.claim_public_business_auth_v1(text,text)
 from public,anon,authenticated,doji_employee,doji_business,service_role;
grant execute on function public.claim_public_business_auth_v1(text,text) to service_role;
commit;
