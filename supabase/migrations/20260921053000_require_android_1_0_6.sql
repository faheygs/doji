-- Google Play Android version 1.0.6 (versionCode 14) is available to the
-- existing Alpha testers and is now the required Android release.
-- Preserve the existing Play Store URL and user-facing update message.

do $$
begin
  update public.mobile_release_policy
  set latest_version = '1.0.6',
      latest_build = 14,
      minimum_version = '1.0.6',
      minimum_build = 14,
      enabled = true,
      updated_at = now()
  where platform = 'android';

  if not found then
    raise exception 'Android mobile release policy row is missing';
  end if;
end
$$;
