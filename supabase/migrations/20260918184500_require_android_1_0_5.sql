-- Google Play Android version 1.0.5 (versionCode 12) is the required release.
-- Preserve the existing Play Store URL and user-facing critical-update message.

do $$
begin
  update public.mobile_release_policy
  set latest_version = '1.0.5',
      latest_build = 12,
      minimum_version = '1.0.5',
      minimum_build = 12,
      enabled = true,
      updated_at = now()
  where platform = 'android';

  if not found then
    raise exception 'Android mobile release policy row is missing';
  end if;
end
$$;
