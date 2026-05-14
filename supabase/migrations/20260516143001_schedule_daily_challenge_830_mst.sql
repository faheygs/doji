-- Run schedule-daily-challenge at 8:30 AM MST (UTC−7) → 15:30 UTC.
-- If your environment uses MDT that day, local wall-clock 8:30 AM is 14:30 UTC (`30 14 * * *`).

DO $$
DECLARE
  j RECORD;
BEGIN
  FOR j IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'doji_schedule_daily_challenge'
  LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'doji_schedule_daily_challenge',
  '30 15 * * *',
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
