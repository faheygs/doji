-- Enrollment-only release: no portal authorization, commands, actor FKs or cutover changes.
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
-- Fail closed on legacy PUBLIC/default grants. NOINHERIT does not remove PUBLIC
-- privileges. Never silently revoke a shared member grant to make this pass.
do $$
declare exposed text;
begin
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) into exposed
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f'
    and not exists(select 1 from pg_catalog.pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
    and has_function_privilege('doji_employee',p.oid,'EXECUTE')
    and p.oid <> 'public.get_employee_registration_status_v1()'::regprocedure
    -- Reviewed September 26 against the production schema-only export. These
    -- existing PUBLIC helpers are argument-only immutable calculators or
    -- SECURITY INVOKER trigger functions (not callable as ordinary RPCs).
    -- Employees have no member-table or TRIGGER grants. Preserve member grants;
    -- any body/signature/security/return-type change requires another review.
    and not exists (
      select 1 from (values
        ('level_from_xp(integer)','38926c89498cd4a777f07c619f76839f','integer','i'),
        ('shields_for_level(integer)','471825f64f24c04e36bf7d99387b4920','integer','i'),
        ('sparks_for_badge_tier(text)','2d9e9736db15346df8b18513ff2d1147','integer','i'),
        ('sparks_for_level(integer)','05c86e4d237bfefe02e645a52e5e8fc7','integer','i'),
        ('sparks_for_xp(integer)','1e41fe5ac4224300576b72b7f01f9f4a','integer','i'),
        ('comments_enforce_parent()','58832d4c0193e9ec5f028865724becd5','trigger','v'),
        ('touch_friendship_accepted_at()','11100be9f2fa8d9b1e6d525573703d74','trigger','v'),
        ('trg_award_streak_shields()','52addff1cfceaa19c0706905a48ea509','trigger','v'),
        ('trg_poll_vote_custom_text()','39b55951bd504f4586ea0cc4552b3a1e','trigger','v'),
        ('trg_profile_xp_level()','3cb143245e6f3ec95db10990217b5788','trigger','v'),
        ('update_updated_at()','204b9b9355e61b7541bc0633bbc9294c','trigger','v'),
        ('validate_format_post_caption()','4a6ddbf25ca687fd0257dcb6868a9d25','trigger','v')
      ) reviewed(signature,source_hash,return_type,volatility)
      where p.oid=to_regprocedure('public.'||reviewed.signature)
        and md5(p.prosrc)=reviewed.source_hash and not p.prosecdef
        and p.prorettype=to_regtype(reviewed.return_type)
        and p.provolatile::text=reviewed.volatility
        and p.prolang in (select oid from pg_catalog.pg_language where lanname in ('sql','plpgsql'))
    );
  if exposed is not null then raise exception 'Employee isolation preflight: unexpected RPC access: %', exposed; end if;
  select string_agg(c.oid::regclass::text, ', ') into exposed
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','v','m','p')
    and has_table_privilege('doji_employee',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
  if exposed is not null then raise exception 'Employee isolation preflight: unexpected table access: %', exposed; end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
