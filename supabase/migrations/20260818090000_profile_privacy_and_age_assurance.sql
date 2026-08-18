-- New accounts must pass a server-authoritative 13+ gate before a public
-- profile can exist. The asserted birth date is evaluated in this transaction
-- and deliberately is not retained.
create table if not exists public.age_assurances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  age_band text not null check (age_band in ('13_plus')),
  method text not null check (method in ('self_declared_birth_date', 'legacy_13_plus_gate')),
  policy_version text not null,
  assessed_at timestamptz not null default now()
);

alter table public.age_assurances enable row level security;
revoke all on table public.age_assurances from public, anon, authenticated;

-- Existing accounts accepted the previous 13+ Terms gate. This preserves
-- access while clearly distinguishing the former assurance method.
insert into public.age_assurances (user_id, age_band, method, policy_version, assessed_at)
select profile.id, '13_plus', 'legacy_13_plus_gate', '2026-08-18', coalesce(profile.created_at, now())
from public.profiles profile
on conflict (user_id) do nothing;

-- Raw authenticated profile reads may only request the explicit public
-- contract. Full owner rows continue to come from get_own_profile().
revoke select on table public.profiles from authenticated;
grant select (
  id, username, display_name, avatar_url, avatar_gradient, bio,
  current_streak, longest_streak, total_completions, total_missed,
  xp, level, reactions_received, reactions_given, accent_theme,
  equipped_border_key, equipped_title_key, created_at, updated_at
) on table public.profiles to authenticated;

-- Administrative capability is private account metadata, not part of the
-- public profile shape. Edge functions acting with the caller's JWT use this
-- owner-scoped predicate instead of selecting the column directly.
create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select profile.is_admin
    from public.profiles profile
    where profile.id = auth.uid()
  ), false);
$$;

revoke all on function public.is_current_user_admin() from public, anon;
grant execute on function public.is_current_user_admin() to authenticated;

-- Remove the pre-age-assurance entry point. Keeping the old overload without
-- EXECUTE would still make future privilege drift dangerous, so drop it.
drop function if exists public.create_own_profile(text, text, text[], text, text);
drop function if exists public.create_own_profile(text, text, text[], text, text, date);

create function public.create_own_profile(
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
    user_id, age_band, method, policy_version, assessed_at
  ) values (
    uid, '13_plus', 'self_declared_birth_date', '2026-08-18', now()
  ) on conflict (user_id) do update set
    age_band = excluded.age_band,
    method = excluded.method,
    policy_version = excluded.policy_version,
    assessed_at = excluded.assessed_at;

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

-- Harden every self-service profile field at the database boundary. In
-- particular, malformed preference JSON must never be able to break boolean
-- casts in notification fanout queries.
create or replace function public.update_own_profile(
  p_patch jsonb,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  profile_row public.profiles%rowtype;
  saved jsonb;
  unknown_keys text[];
  normalized_username text;
  normalized_timezone text;
  requested_accent text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 16 then
    raise exception 'Invalid idempotency key';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Invalid profile patch';
  end if;

  select array_agg(key) into unknown_keys
  from jsonb_object_keys(p_patch) key
  where key not in (
    'username', 'display_name', 'bio', 'avatar_url', 'notification_preferences',
    'onboarding_completed_at', 'timezone', 'app_theme', 'appearance_mode',
    'accent_theme'
  );
  if unknown_keys is not null then raise exception 'Unsupported profile field'; end if;

  if p_patch ? 'username' then
    normalized_username := lower(trim(p_patch ->> 'username'));
    if normalized_username !~ '^[a-z0-9_]{3,30}$' then raise exception 'Invalid username'; end if;
  end if;
  if p_patch ? 'display_name' and length(coalesce(p_patch ->> 'display_name', '')) > 80 then
    raise exception 'Display name is too long';
  end if;
  if p_patch ? 'bio' and length(coalesce(p_patch ->> 'bio', '')) > 150 then
    raise exception 'Bio is too long';
  end if;
  if p_patch ? 'avatar_url'
     and nullif(trim(p_patch ->> 'avatar_url'), '') is not null
     and position(
       '/storage/v1/object/public/avatars/' || uid::text || '/'
       in trim(p_patch ->> 'avatar_url')
     ) = 0 then
    raise exception 'Invalid profile photo';
  end if;

  if p_patch ? 'timezone' then
    normalized_timezone := nullif(trim(p_patch ->> 'timezone'), '');
    if normalized_timezone is null or not exists (
      select 1 from pg_catalog.pg_timezone_names zone where zone.name = normalized_timezone
    ) then raise exception 'Invalid timezone'; end if;
  end if;
  if p_patch ? 'app_theme' and (p_patch ->> 'app_theme') not in ('light', 'dark') then
    raise exception 'Invalid app theme';
  end if;
  if p_patch ? 'appearance_mode' and (p_patch ->> 'appearance_mode') not in ('light', 'dark') then
    raise exception 'Invalid appearance mode';
  end if;

  if p_patch ? 'accent_theme' then
    requested_accent := nullif(trim(p_patch ->> 'accent_theme'), '');
    if requested_accent is null then raise exception 'Invalid accent theme'; end if;
    if requested_accent <> 'doji_orange' and not exists (
      select 1
      from public.user_shop_items owned
      join public.shop_items item on item.key = owned.item_key
      where owned.user_id = uid and item.key = requested_accent and item.kind = 'theme'
    ) then raise exception 'Accent theme is not owned'; end if;
  end if;

  if p_patch ? 'notification_preferences' then
    if jsonb_typeof(p_patch -> 'notification_preferences') <> 'object'
       or exists (
         select 1 from jsonb_each(p_patch -> 'notification_preferences') preference
         where preference.key not in (
           'push_enabled', 'show_bell_badge', 'doji_start', 'friend_post',
           'reactions_on_my_post', 'friend_request', 'friend_accepted', 'badges',
           'comment', 'mention', 'suggestion', 'comment_reply'
         ) or jsonb_typeof(preference.value) <> 'boolean'
       ) then
      raise exception 'Invalid notification preferences';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || p_idempotency_key, 0));
  select receipt.result into saved from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return saved; end if;

  update public.profiles set
    username = case when p_patch ? 'username' then normalized_username else username end,
    display_name = case when p_patch ? 'display_name'
      then coalesce(nullif(trim(p_patch ->> 'display_name'), ''), username)
      else display_name end,
    bio = case when p_patch ? 'bio' then nullif(trim(p_patch ->> 'bio'), '') else bio end,
    avatar_url = case when p_patch ? 'avatar_url'
      then nullif(trim(p_patch ->> 'avatar_url'), '') else avatar_url end,
    notification_preferences = case when p_patch ? 'notification_preferences'
      then notification_preferences || (p_patch -> 'notification_preferences')
      else notification_preferences end,
    onboarding_completed_at = case when p_patch ? 'onboarding_completed_at'
      then (p_patch ->> 'onboarding_completed_at')::timestamptz
      else onboarding_completed_at end,
    timezone = case when p_patch ? 'timezone' then normalized_timezone else timezone end,
    app_theme = case when p_patch ? 'app_theme' then p_patch ->> 'app_theme' else app_theme end,
    appearance_mode = case when p_patch ? 'appearance_mode'
      then p_patch ->> 'appearance_mode' else appearance_mode end,
    accent_theme = case when p_patch ? 'accent_theme' then requested_accent else accent_theme end
  where id = uid
  returning * into profile_row;
  if not found then raise exception 'Profile not found'; end if;

  saved := to_jsonb(profile_row);
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, saved);
  return saved;
end; $$;

revoke all on function public.update_own_profile(jsonb, text) from public, anon;
grant execute on function public.update_own_profile(jsonb, text) to authenticated;

comment on table public.age_assurances is
  'Private minimum-data record of the server-authoritative 13+ onboarding gate; birth dates are not retained.';
