-- Automated Doji pipeline: pg_cron + pg_net call Edge Functions (no external cron service).
-- After db push, create Vault secrets (see scripts/vault_pg_cron_secrets.sql):
--   doji_project_url   = https://<project-ref>.supabase.co  (no trailing slash)
--   doji_cron_secret   = same value as Edge secret CRON_SECRET

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
DECLARE
  j RECORD;
BEGIN
  FOR j IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'doji_schedule_daily_challenge',
      'doji_dispatch_challenge_pushes',
      'doji_expire_events'
    )
  LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;

-- Once per day (06:00 UTC): create daily_events + fan-out user_events; random fires_at that evening UTC.
SELECT cron.schedule(
  'doji_schedule_daily_challenge',
  '0 6 * * *',
  $cron$
  SELECT net.http_post(
    url := (
      SELECT decrypted_secret::text FROM vault.decrypted_secrets WHERE name = 'doji_project_url' LIMIT 1
    ) || '/functions/v1/schedule-daily-challenge',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret::text FROM vault.decrypted_secrets WHERE name = 'doji_cron_secret' LIMIT 1
      )
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);

-- Every minute: send Expo pushes when fires_at has passed (keeps latency low without external runner).
SELECT cron.schedule(
  'doji_dispatch_challenge_pushes',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := (
      SELECT decrypted_secret::text FROM vault.decrypted_secrets WHERE name = 'doji_project_url' LIMIT 1
    ) || '/functions/v1/dispatch-challenge-pushes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret::text FROM vault.decrypted_secrets WHERE name = 'doji_cron_secret' LIMIT 1
      )
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);

-- Every 5 minutes: mark missed user_events and streak maintenance.
SELECT cron.schedule(
  'doji_expire_events',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := (
      SELECT decrypted_secret::text FROM vault.decrypted_secrets WHERE name = 'doji_project_url' LIMIT 1
    ) || '/functions/v1/expire-events',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret::text FROM vault.decrypted_secrets WHERE name = 'doji_cron_secret' LIMIT 1
      )
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);
