-- Reset feed data and start a new open-ended (task) challenge right now (10 min window).
-- Task challenges use type = 'task' (text answer, no community post row).
-- Run: npx supabase db query --linked -f supabase/scripts/reset_feed_and_new_task.sql

BEGIN;

DELETE FROM public.reactions;
DELETE FROM public.posts;
DELETE FROM public.poll_votes;

UPDATE public.poll_options SET vote_count = 0;
UPDATE public.challenges SET participant_count = 0 WHERE type IN ('poll', 'photo', 'task');

DELETE FROM public.user_events;
DELETE FROM public.daily_events;

DO $$
DECLARE
  de_id uuid;
  ch_id uuid;
  expires timestamptz;
BEGIN
  SELECT c.id
  INTO ch_id
  FROM public.challenges c
  WHERE c.type = 'task' AND c.is_active = true
  ORDER BY random()
  LIMIT 1;

  IF ch_id IS NULL THEN
    RAISE EXCEPTION 'No active task challenge found (challenges.type = task, is_active = true)';
  END IF;

  INSERT INTO public.daily_events (challenge_id, fires_at, window_minutes)
  VALUES (ch_id, now(), 10)
  RETURNING id, fires_at + (window_minutes || ' minutes')::interval INTO de_id, expires;

  INSERT INTO public.user_events (user_id, daily_event_id, status, expires_at)
  SELECT p.id, de_id, 'pending', expires
  FROM public.profiles p
  ON CONFLICT (user_id, daily_event_id) DO UPDATE SET
    status = 'pending',
    completed_at = NULL,
    notified_at = NULL,
    expires_at = excluded.expires_at;

  RAISE NOTICE 'New daily_event % for task challenge % (expires %)', de_id, ch_id, expires;
END $$;

COMMIT;
