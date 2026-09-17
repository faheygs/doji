-- App Store version 1.0.2 (build 76) is publicly available. Require every
-- older iOS client to update before continuing. Do not advertise TestFlight
-- version 1.0.3 (build 77) until it is approved and live on the App Store.

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
  'ios',
  '1.0.2',
  76,
  '1.0.2',
  76,
  'https://apps.apple.com/app/id6768727326',
  'A critical Doji update is ready. Update from the App Store to continue.',
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
