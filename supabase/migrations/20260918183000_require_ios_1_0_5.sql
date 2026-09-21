-- App Store version 1.0.5 (build 79) is publicly installable. Require every
-- older iOS client to update before continuing while preserving the existing
-- App Store URL and user-facing critical-update message.

do $$
begin
  update public.mobile_release_policy
  set latest_version = '1.0.5',
      latest_build = 79,
      minimum_version = '1.0.5',
      minimum_build = 79,
      enabled = true,
      updated_at = now()
  where platform = 'ios';

  if not found then
    raise exception 'iOS mobile release policy row is missing';
  end if;
end
$$;
