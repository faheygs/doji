-- Build 10 is uploaded but still pending availability on the Closed testing -
-- Alpha track used by existing testers. Keep the required-update policy aligned
-- with the newest build those users can actually install. Raise this to 1.0.3 / 10
-- only after Play reports that release as available on the Alpha track.

update public.mobile_release_policy
set latest_version = '1.0.2',
    latest_build = 9,
    minimum_version = '1.0.2',
    minimum_build = 9,
    update_message = 'A critical Doji update is ready. Update from the Play Store to continue.',
    enabled = true,
    updated_at = now()
where platform = 'android';
