-- DRAFT: NOT DEPLOYABLE. Scope approved; full-schema and hosted Auth tests pending.
-- Employee identities share the existing Auth service, not the member identity.
-- Additive foundation only. Registration/cutover remain disabled until release gates pass.
begin;
set local lock_timeout = '3s';

create role doji_employee nologin noinherit;
grant doji_employee to authenticator;
grant usage on schema public to doji_employee;
-- No direct Auth-schema access is needed. The exact public SECURITY DEFINER
-- entry points read caller claims; employees cannot query managed Auth objects.
-- The hosted migration role cannot grant USAGE on the managed Auth schema.
-- Never grant authenticated/anon membership or member-table access to this role.

create table public.admin_employees (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null check (char_length(display_name) between 1 and 80),
  status text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  roles text[] not null default '{}',
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint employee_roles_allowed check (roles <@ array[
    'super_admin','operations','moderator','legal_reviewer','business_reviewer']::text[])
);
alter table public.admin_employees enable row level security;
revoke all on public.admin_employees from public, anon, authenticated, doji_employee;

create table public.admin_employee_access_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete restrict,
  employee_id uuid not null references public.admin_employees(id) on delete restrict,
  action text not null,
  reason text not null,
  request_id text not null,
  previous_state jsonb not null,
  next_state jsonb not null,
  occurred_at timestamptz not null default clock_timestamp(),
  unique(actor_id, request_id)
);
alter table public.admin_employee_access_events enable row level security;
revoke all on public.admin_employee_access_events from public, anon, authenticated, doji_employee;

-- Auth Admin creation is server-only and sets the Postgres role in the same Auth
-- transaction. Do not convert an existing member or trust user_metadata for access.
create function public.get_employee_registration_status_v1()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare employee public.admin_employees%rowtype; account auth.users%rowtype;
begin
  if auth.jwt()->>'role' is distinct from 'doji_employee' or auth.uid() is null then
    raise exception 'Employee account required' using errcode = '42501';
  end if;
  select * into account from auth.users where id = auth.uid();
  if account.role is distinct from 'doji_employee'
     or account.raw_app_meta_data->>'account_type' is distinct from 'employee'
     or account.email_confirmed_at is null then
    raise exception 'Verified employee account required' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = account.id) then
    raise exception 'Member identities cannot become employee identities' using errcode = '42501';
  end if;
  insert into public.admin_employees(id, display_name)
    values(account.id, left(coalesce(nullif(btrim(account.raw_user_meta_data->>'display_name'), ''), 'Employee'),80))
    on conflict (id) do nothing;
  select * into employee from public.admin_employees where id = account.id;
  return jsonb_build_object('status',employee.status,'display_name',employee.display_name);
end;
$$;
revoke all on function public.get_employee_registration_status_v1() from public, anon, authenticated;
grant execute on function public.get_employee_registration_status_v1() to doji_employee;

-- Fixed global budget protects the existing Auth/email capacity from the public
-- registration endpoint. It does not inspect or throttle member registrations.
create table public.admin_employee_registration_budget (
  singleton boolean primary key default true check(singleton),
  started_at timestamptz not null,
  attempts integer not null,
  total_attempts integer not null
);
alter table public.admin_employee_registration_budget enable row level security;
revoke all on public.admin_employee_registration_budget from public, anon, authenticated, doji_employee;
create function public.claim_employee_registration_v1()
returns boolean language plpgsql security definer set search_path = '' as $$
declare attempts_used integer; total_used integer;
begin
  insert into public.admin_employee_registration_budget(singleton,started_at,attempts,total_attempts)
    values(true,clock_timestamp(),1,1)
    on conflict(singleton) do update set
      started_at = case when admin_employee_registration_budget.started_at < clock_timestamp()-interval '1 hour'
        then clock_timestamp() else admin_employee_registration_budget.started_at end,
      attempts = case when admin_employee_registration_budget.started_at < clock_timestamp()-interval '1 hour'
        then 1 else least(admin_employee_registration_budget.attempts+1,6) end,
      total_attempts = least(admin_employee_registration_budget.total_attempts+1,101)
    returning attempts,total_attempts into attempts_used,total_used;
  return attempts_used <= 5 and total_used <= 100;
end;
$$;
revoke all on function public.claim_employee_registration_v1() from public, anon, authenticated, doji_employee;
grant execute on function public.claim_employee_registration_v1() to service_role;

-- Email recovery shares the registration ceiling, including unknown/member
-- addresses, so it cannot become a second unbounded mail endpoint. A retry
-- never creates, converts, resets or confirms an account. Service only.
create function public.claim_employee_verification_v1(p_email text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if char_length(coalesce(p_email,'')) not between 3 and 254 then return false; end if;
  if not public.claim_employee_registration_v1() then return false; end if;
  return exists(select 1 from auth.users u where u.email=lower(btrim(p_email))
    and u.role='doji_employee' and u.raw_app_meta_data->>'account_type'='employee'
    and u.email_confirmed_at is null
    and not exists(select 1 from public.profiles p where p.id=u.id));
end;
$$;
revoke all on function public.claim_employee_verification_v1(text) from public,anon,authenticated,doji_employee;
grant execute on function public.claim_employee_verification_v1(text) to service_role;

-- Bootstrap is deliberately unavailable to every browser role. The release
-- operator must verify the owner's exact new employee UUID out of band.
create function public.bootstrap_employee_owner_v1(p_employee_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if char_length(btrim(coalesce(p_reason,''))) not between 10 and 1000 then raise exception 'Reason required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(92610001);
  if exists(select 1 from public.admin_employees where 'super_admin'=any(roles)) then
    raise exception 'Employee owner is already established';
  end if;
  if not exists(select 1 from auth.users u join public.admin_employees e on e.id=u.id
    where u.id=p_employee_id and u.role='doji_employee' and u.email_confirmed_at is not null
      and u.raw_app_meta_data->>'account_type'='employee' and e.status='pending') then
    raise exception 'Verified pending employee required';
  end if;
  update public.admin_employees set status='active',roles=array['super_admin'],updated_at=clock_timestamp()
    where id=p_employee_id;
  insert into public.admin_employee_access_events(actor_id,employee_id,action,reason,request_id,previous_state,next_state)
    values(null,p_employee_id,'employee.owner_bootstrapped',btrim(p_reason),'owner-bootstrap',
      '{"status":"pending","roles":[]}', '{"status":"active","roles":["super_admin"]}');
end;
$$;
revoke all on function public.bootstrap_employee_owner_v1(uuid,text) from public, anon, authenticated, doji_employee;
grant execute on function public.bootstrap_employee_owner_v1(uuid,text) to service_role;

-- A fixed global budget bounds unauthenticated employee login lookups without
-- touching member sign-in settings or introducing a per-member dependency.
create table public.admin_employee_login_budget (
  singleton boolean primary key default true check(singleton),
  started_at timestamptz not null,
  attempts integer not null
);
alter table public.admin_employee_login_budget enable row level security;
revoke all on public.admin_employee_login_budget from public,anon,authenticated,doji_employee;
create function public.employee_login_allowed_v1(p_email text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare used integer;
begin
  if char_length(coalesce(p_email,'')) not between 3 and 254 then return false; end if;
  insert into public.admin_employee_login_budget values(true,clock_timestamp(),1)
    on conflict(singleton) do update set
      started_at=case when admin_employee_login_budget.started_at < clock_timestamp()-interval '1 minute'
        then clock_timestamp() else admin_employee_login_budget.started_at end,
      attempts=case when admin_employee_login_budget.started_at < clock_timestamp()-interval '1 minute'
        then 1 else least(admin_employee_login_budget.attempts+1,61) end
    returning attempts into used;
  if used>60 then return false; end if;
  return exists(select 1 from auth.users where email=lower(btrim(p_email)) and role='doji_employee'
    and raw_app_meta_data->>'account_type'='employee');
end;
$$;
revoke all on function public.employee_login_allowed_v1(text) from public,anon,authenticated,doji_employee;
grant execute on function public.employee_login_allowed_v1(text) to service_role;
commit;
