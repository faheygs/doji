-- Mobile notification contract v2 writes four canonical preference keys while
-- continuing to dual-write the legacy aliases. Keep update_own_profile's strict
-- allowlist, but accept the complete current client contract so first-run
-- onboarding cannot be stranded at the notification step.

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
           'push_enabled', 'show_bell_badge',
           'doji_live', 'friend_requests', 'mentions_replies', 'reviews_account',
           'doji_start', 'friend_post', 'reactions_on_my_post', 'friend_request',
           'friend_accepted', 'badges', 'comment', 'mention', 'suggestion',
           'comment_reply'
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
