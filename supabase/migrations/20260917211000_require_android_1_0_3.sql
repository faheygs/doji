-- Version 1.0.3 (build 10) is active on the Google Play internal-testing
-- track and contains critical reliability fixes. Require every older Android
-- client to update before continuing. Keep the iOS policy unchanged while its
-- candidate remains in TestFlight.

insert into public.mobile_release_policy (
  platform,
  latest_version,
  latest_build,
  minimum_version,
  minimum_build,
  store_url,
  update_message,
  enabled,
  updated_at
)
values (
  'android',
  '1.0.3',
  10,
  '1.0.3',
  10,
  'https://play.google.com/store/apps/details?id=com.doit.challengeapp',
  'A critical Doji update is ready. Update from the Play Store to continue.',
  true,
  now()
)
on conflict (platform) do update
set latest_version = excluded.latest_version,
    latest_build = excluded.latest_build,
    minimum_version = excluded.minimum_version,
    minimum_build = excluded.minimum_build,
    store_url = excluded.store_url,
    update_message = excluded.update_message,
    enabled = excluded.enabled,
    updated_at = excluded.updated_at;
