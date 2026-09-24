-- Apple App Store iOS version 1.0.7 (build 90) is publicly available and is
-- now the required iOS release.
-- Preserve the existing App Store URL and user-facing update message.

do $$
begin
  update public.mobile_release_policy
  set latest_version = '1.0.7',
      latest_build = 90,
      minimum_version = '1.0.7',
      minimum_build = 90,
      enabled = true,
      updated_at = now()
  where platform = 'ios';

  if not found then
    raise exception 'iOS mobile release policy row is missing';
  end if;
end
$$;
