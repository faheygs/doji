-- Google Play Android version 1.0.7 (versionCode 17) is available to the
-- existing Alpha testers and is now the required Android release.
-- Preserve the existing Play Store URL and user-facing update message.

do $$
begin
  update public.mobile_release_policy
  set latest_version = '1.0.7',
      latest_build = 17,
      minimum_version = '1.0.7',
      minimum_build = 17,
      enabled = true,
      updated_at = now()
  where platform = 'android';

  if not found then
    raise exception 'Android mobile release policy row is missing';
  end if;
end
$$;
