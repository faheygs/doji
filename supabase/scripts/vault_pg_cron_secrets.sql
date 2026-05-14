-- ONE-TIME setup after applying migration 20260516143000_pg_cron_doji_automation.sql
-- Run in Supabase Dashboard → SQL Editor (replace placeholders).
--
-- 1) Project URL: Dashboard → Project Settings → API → Project URL
--    Example: https://abcdefghijklmnopqrst.supabase.co  (no trailing slash)
--
-- 2) Cron secret: must match Edge Functions secret CRON_SECRET exactly
--    (Dashboard → Project Settings → Edge Functions → Secrets)

SELECT vault.create_secret(
  'https://YOUR_PROJECT_REF.supabase.co',
  'doji_project_url',
  'Base URL for pg_net → Edge Functions'
);

SELECT vault.create_secret(
  'YOUR_CRON_SECRET_SAME_AS_EDGE_FUNCTIONS',
  'doji_cron_secret',
  'Bearer token for schedule-daily-challenge, dispatch-challenge-pushes, expire-events'
);

-- Verify (names only; values stay encrypted in storage):
-- SELECT name, description FROM vault.secrets WHERE name LIKE 'doji_%';

-- If you need to rotate or fix a secret, delete the old row in Dashboard → Project Settings → Vault
-- (or delete from vault.secrets where appropriate) and run create_secret again.
