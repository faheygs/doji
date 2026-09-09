-- Provision a dedicated, hidden Google Play review account without pretending
-- that the platform-operated reviewer completed the consumer signup flow.

alter table public.age_assurances
  drop constraint if exists age_assurances_method_check;

alter table public.age_assurances
  add constraint age_assurances_method_check
  check (method in (
    'self_declared_birth_date',
    'legacy_13_plus_gate',
    'review_account_provisioned'
  ));

alter table public.legal_acceptances
  drop constraint if exists legal_acceptances_method_check;

alter table public.legal_acceptances
  add constraint legal_acceptances_method_check
  check (method in (
    'affirmative_signup',
    'legacy_terms_gate',
    'review_account_provisioned'
  ));

create or replace function public.persist_signup_legal_acceptance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  metadata jsonb;
  terms_at timestamptz;
  privacy_at timestamptz;
begin
  if coalesce(new.is_demo_account, false) then
    insert into public.legal_acceptances (
      user_id, terms_version, terms_accepted_at,
      privacy_version, privacy_accepted_at, method
    ) values (
      new.id, '2026-08-20', clock_timestamp(),
      '2026-08-20', clock_timestamp(), 'review_account_provisioned'
    ) on conflict (user_id) do update set
      terms_version = excluded.terms_version,
      terms_accepted_at = excluded.terms_accepted_at,
      privacy_version = excluded.privacy_version,
      privacy_accepted_at = excluded.privacy_accepted_at,
      method = excluded.method,
      recorded_at = clock_timestamp();

    return new;
  end if;

  select coalesce(account.raw_user_meta_data, '{}'::jsonb)
  into metadata
  from auth.users account
  where account.id = new.id;

  if metadata ->> 'terms_version' <> '2026-08-20'
     or metadata ->> 'privacy_version' <> '2026-08-20'
     or nullif(metadata ->> 'terms_accepted_at', '') is null
     or nullif(metadata ->> 'privacy_accepted_at', '') is null then
    raise exception 'Current Terms of Use and Privacy Policy must be accepted';
  end if;

  begin
    terms_at := (metadata ->> 'terms_accepted_at')::timestamptz;
    privacy_at := (metadata ->> 'privacy_accepted_at')::timestamptz;
  exception when others then
    raise exception 'Invalid legal acceptance timestamp';
  end;

  if terms_at > clock_timestamp() + interval '5 minutes'
     or privacy_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'Invalid legal acceptance timestamp';
  end if;

  insert into public.legal_acceptances (
    user_id, terms_version, terms_accepted_at,
    privacy_version, privacy_accepted_at, method
  ) values (
    new.id, metadata ->> 'terms_version', terms_at,
    metadata ->> 'privacy_version', privacy_at, 'affirmative_signup'
  ) on conflict (user_id) do nothing;

  return new;
end;
$$;

insert into public.age_assurances (
  user_id, age_band, method, policy_version, assessed_at
)
select
  account.id, '13_plus', 'review_account_provisioned', '2026-08-18', clock_timestamp()
from auth.users account
where lower(account.email) = 'google-reviewer@doji.app'
on conflict (user_id) do update set
  age_band = excluded.age_band,
  method = excluded.method,
  policy_version = excluded.policy_version,
  assessed_at = excluded.assessed_at;

insert into public.profiles (
  id, username, display_name, bio,
  current_streak, longest_streak, total_completions, total_missed,
  xp, level, reactions_received, reactions_given, streak_shields, sparks,
  accent_theme, appearance_mode, app_theme, timezone,
  is_admin, is_banned, is_demo_account, onboarding_completed_at,
  created_at, updated_at
)
select
  account.id, 'google_reviewer', 'Google Reviewer', null,
  0, 0, 0, 0,
  0, 1, 0, 0, 0, 4000,
  'doji_orange', 'light', 'light', 'America/Denver',
  false, false, true, clock_timestamp(),
  clock_timestamp(), clock_timestamp()
from auth.users account
where lower(account.email) = 'google-reviewer@doji.app'
on conflict (id) do update set
  username = excluded.username,
  display_name = excluded.display_name,
  is_admin = false,
  is_banned = false,
  is_demo_account = true,
  onboarding_completed_at = coalesce(public.profiles.onboarding_completed_at, clock_timestamp()),
  updated_at = clock_timestamp();

comment on column public.profiles.is_demo_account is
  'Hides platform review accounts from normal discovery, feed-author, profile, and leaderboard surfaces.';
