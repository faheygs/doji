-- A small server-owned release policy lets shipped clients learn that a newer
-- native binary is actually available without scraping either storefront.
-- Keep rows disabled until the corresponding store version is publicly live.

create table if not exists public.mobile_release_policy (
  platform text primary key check (platform in ('ios', 'android')),
  latest_version text not null check (latest_version ~ '^[0-9]+(\.[0-9]+){1,3}$'),
  latest_build integer not null check (latest_build > 0),
  minimum_version text not null check (minimum_version ~ '^[0-9]+(\.[0-9]+){1,3}$'),
  minimum_build integer not null check (minimum_build > 0),
  store_url text not null check (store_url ~ '^https://'),
  update_message text check (update_message is null or length(update_message) between 1 and 240),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.mobile_release_policy enable row level security;
revoke all on table public.mobile_release_policy from public, anon, authenticated;

insert into public.mobile_release_policy (
  platform, latest_version, latest_build, minimum_version, minimum_build,
  store_url, enabled
)
values
  (
    'ios', '1.0.1', 74, '1.0.0', 1,
    'https://apps.apple.com/app/id6768727326', false
  ),
  (
    'android', '1.0.1', 6, '1.0.0', 1,
    'https://play.google.com/store/apps/details?id=com.doit.challengeapp', false
  )
on conflict (platform) do nothing;

create or replace function public.get_mobile_release_policy(p_platform text)
returns table (
  platform text,
  latest_version text,
  latest_build integer,
  minimum_version text,
  minimum_build integer,
  store_url text,
  update_message text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select policy.platform, policy.latest_version, policy.latest_build,
         policy.minimum_version, policy.minimum_build, policy.store_url,
         policy.update_message, policy.updated_at
  from public.mobile_release_policy policy
  where policy.platform = lower(trim(p_platform))
    and policy.enabled = true;
$$;

revoke all on function public.get_mobile_release_policy(text) from public;
grant execute on function public.get_mobile_release_policy(text) to anon, authenticated;
