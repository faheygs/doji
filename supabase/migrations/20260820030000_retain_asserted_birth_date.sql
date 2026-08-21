-- Retain the exact birth date a new user self-declared as a private audit
-- record. It is deliberately excluded from profiles, public RPCs, and realtime
-- payloads. Older assurances remain nullable because their transient dates were
-- intentionally discarded under the previous policy and cannot be reconstructed.
alter table public.age_assurances
  add column if not exists asserted_birth_date date;

create or replace function public.create_own_profile(
  p_username text,
  p_display_name text,
  p_avatar_gradient text[],
  p_timezone text,
  p_app_theme text,
  p_birth_date date,
  p_bio text default null,
  p_avatar_url text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  profile_row public.profiles%rowtype;
  normalized text := lower(trim(p_username));
  normalized_timezone text := nullif(trim(p_timezone), '');
  normalized_bio text := nullif(trim(p_bio), '');
  normalized_avatar_url text := nullif(trim(p_avatar_url), '');
  local_today date;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':profile-create', 0));

  select * into profile_row from public.profiles where id = uid;
  if found then return to_jsonb(profile_row); end if;

  if normalized_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names zone
    where zone.name = normalized_timezone
  ) then
    raise exception 'Invalid timezone';
  end if;
  local_today := (clock_timestamp() at time zone normalized_timezone)::date;
  if p_birth_date is null
     or p_birth_date > (local_today - interval '13 years')::date then
    raise exception 'You must be at least 13 to use Doji';
  end if;
  if p_birth_date < (local_today - interval '120 years')::date then
    raise exception 'Invalid birth date';
  end if;
  if normalized !~ '^[a-z0-9_]{3,30}$' then raise exception 'Invalid username'; end if;
  if length(coalesce(p_display_name, '')) > 80 then raise exception 'Display name is too long'; end if;
  if length(coalesce(normalized_bio, '')) > 150 then raise exception 'Bio is too long'; end if;
  if normalized_avatar_url is not null and position(
    '/storage/v1/object/public/avatars/' || uid::text || '/'
    in normalized_avatar_url
  ) = 0 then
    raise exception 'Invalid profile photo';
  end if;

  insert into public.age_assurances (
    user_id, age_band, method, policy_version, assessed_at, asserted_birth_date
  ) values (
    uid, '13_plus', 'self_declared_birth_date', '2026-08-20', now(), p_birth_date
  ) on conflict (user_id) do update set
    age_band = excluded.age_band,
    method = excluded.method,
    policy_version = excluded.policy_version,
    assessed_at = excluded.assessed_at,
    asserted_birth_date = excluded.asserted_birth_date;

  insert into public.profiles (
    id, username, display_name, bio, avatar_url, avatar_gradient, timezone, app_theme,
    appearance_mode, accent_theme, onboarding_completed_at
  ) values (
    uid, normalized, coalesce(nullif(trim(p_display_name), ''), normalized),
    normalized_bio, normalized_avatar_url,
    coalesce(p_avatar_gradient, array['#F97316','#8B5CF6']::text[]),
    normalized_timezone,
    coalesce(nullif(trim(p_app_theme), ''), 'dark'),
    coalesce(nullif(trim(p_app_theme), ''), 'dark'), 'doji_orange', null
  ) returning * into profile_row;

  return to_jsonb(profile_row);
end; $$;

revoke all on function public.create_own_profile(text, text, text[], text, text, date, text, text)
  from public, anon;
grant execute on function public.create_own_profile(text, text, text[], text, text, date, text, text)
  to authenticated;

-- The private assurance table remains inaccessible to handset roles. Auth
-- metadata cleanup still removes the duplicate after this protected row commits.
revoke all on table public.age_assurances from public, anon, authenticated;

comment on column public.age_assurances.asserted_birth_date is
  'Private audit copy of the birth date self-declared during signup; never exposed in public profile or realtime contracts.';

comment on table public.age_assurances is
  'Private server-authoritative 13+ onboarding audit containing the self-declared birth date, assessment method, policy version, and timestamp.';
