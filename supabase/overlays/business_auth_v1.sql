-- LOCAL PREPARATION ONLY. Apply after business_applications_v1.sql.
-- No Auth configuration, member function, authenticator membership or email send.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create table business_private.auth_settings (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 pilot_until timestamptz,
 allowed_emails text[] not null default '{}',
 registration_limit integer not null default 0 check(registration_limit between 0 and 25),
 email_limit integer not null default 0 check(email_limit between 0 and 250),
 registrations_used integer not null default 0,
 emails_used integer not null default 0,
 window_at timestamptz not null default clock_timestamp(),
 attempts integer not null default 0,
 check(cardinality(allowed_emails)<=25)
);
insert into business_private.auth_settings(singleton) values(true);
create table business_private.auth_budgets (
 email text primary key,
 window_at timestamptz not null,
 attempts integer not null default 0,
 last_mail_at timestamptz
);
alter table business_private.auth_settings enable row level security;
alter table business_private.auth_budgets enable row level security;
revoke all on business_private.auth_settings,business_private.auth_budgets
 from public,anon,authenticated,doji_employee,doji_business,service_role;

-- Service boundary only. Returning false commits the consumed request budget;
-- raising an exception would undo it. Allowlist bounds the per-email table.
-- Total pilot send/creation reservations never refill automatically. Failed
-- downstream requests consume reservations too: fail conservatively, no retries.
create function public.claim_business_auth_v1(p_action text,p_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s business_private.auth_settings%rowtype; b business_private.auth_budgets%rowtype;
 u auth.users%rowtype; t timestamptz:=clock_timestamp(); denied jsonb:='{"allowed":false}';
begin
 if p_action is null or p_action not in ('register','signin','resend','recover','verify') or p_email is null
  or length(p_email)>254 or p_email<>lower(btrim(p_email))
  or p_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then return denied; end if;
 select * into s from business_private.auth_settings where singleton for update;
 if not s.enabled or s.pilot_until is null or s.pilot_until<=t then return denied; end if;
 if s.window_at<=t-interval '1 hour' then s.window_at:=t; s.attempts:=0; end if;
 if s.attempts>=600 then return denied; end if;
 update business_private.auth_settings set window_at=s.window_at,attempts=s.attempts+1 where singleton;
 if not (p_email=any(s.allowed_emails)) then return denied; end if;
 insert into business_private.auth_budgets(email,window_at) values(p_email,t) on conflict do nothing;
 select * into b from business_private.auth_budgets where email=p_email for update;
 if b.window_at<=t-interval '1 hour' then b.window_at:=t; b.attempts:=0; end if;
 if b.attempts>=30 then return denied; end if;
 update business_private.auth_budgets set window_at=b.window_at,attempts=b.attempts+1 where email=p_email;
 select * into u from auth.users where lower(email)=p_email limit 1;
 if p_action='register' then
  if u.id is not null or s.registrations_used>=s.registration_limit then return denied; end if;
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
  if s.emails_used>=s.email_limit or b.last_mail_at>t-interval '2 minutes' then return denied; end if;
  update business_private.auth_settings set emails_used=emails_used+1,
   registrations_used=registrations_used+case when p_action='register' then 1 else 0 end where singleton;
  update business_private.auth_budgets set last_mail_at=t where email=p_email;
 end if;
 return jsonb_build_object('allowed',true,'user_id',u.id);
end$$;
revoke all on function public.claim_business_auth_v1(text,text)
 from public,anon,authenticated,doji_employee,doji_business,service_role;
grant execute on function public.claim_business_auth_v1(text,text) to service_role;
commit;
