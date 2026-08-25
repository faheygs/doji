-- Terms and Privacy acceptance are separate affirmative decisions in the app.
-- Persist their exact versions and timestamps outside user-editable auth
-- metadata before a new public profile may be created.

create table if not exists public.legal_acceptances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  terms_version text not null,
  terms_accepted_at timestamptz not null,
  privacy_version text not null,
  privacy_accepted_at timestamptz not null,
  method text not null check (method in ('affirmative_signup', 'legacy_terms_gate')),
  recorded_at timestamptz not null default clock_timestamp()
);

alter table public.legal_acceptances enable row level security;
revoke all on table public.legal_acceptances from public, anon, authenticated;

-- Preserve verifiable current-version metadata for accounts that already used
-- the two-checkbox flow. Malformed metadata is ignored and falls through to
-- the explicit legacy classification below.
do $$
declare
  account_row record;
begin
  for account_row in
    select account.id, account.raw_user_meta_data as metadata
    from auth.users account
    join public.profiles profile on profile.id = account.id
    where account.raw_user_meta_data ->> 'terms_version' = '2026-08-20'
      and account.raw_user_meta_data ->> 'privacy_version' = '2026-08-20'
  loop
    begin
      insert into public.legal_acceptances (
        user_id, terms_version, terms_accepted_at,
        privacy_version, privacy_accepted_at, method
      ) values (
        account_row.id,
        '2026-08-20', (account_row.metadata ->> 'terms_accepted_at')::timestamptz,
        '2026-08-20', (account_row.metadata ->> 'privacy_accepted_at')::timestamptz,
        'affirmative_signup'
      ) on conflict (user_id) do nothing;
    exception when others then
      null;
    end;
  end loop;
end;
$$;

-- Accounts that predate the two-checkbox flow are retained without pretending
-- they accepted the current document versions.
insert into public.legal_acceptances (
  user_id, terms_version, terms_accepted_at,
  privacy_version, privacy_accepted_at, method
)
select
  profile.id,
  'legacy-pre-2026-08-20', coalesce(profile.created_at, clock_timestamp()),
  'legacy-pre-2026-08-20', coalesce(profile.created_at, clock_timestamp()),
  'legacy_terms_gate'
from public.profiles profile
on conflict (user_id) do nothing;

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

drop trigger if exists persist_signup_legal_acceptance_trigger on public.profiles;
create trigger persist_signup_legal_acceptance_trigger
before insert on public.profiles
for each row execute function public.persist_signup_legal_acceptance();

revoke all on function public.persist_signup_legal_acceptance()
  from public, anon, authenticated;

comment on table public.legal_acceptances is
  'Private immutable audit of the separate Terms of Use and Privacy Policy decisions required before profile creation.';
