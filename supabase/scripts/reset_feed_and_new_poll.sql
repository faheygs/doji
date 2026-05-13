-- Reset feed data and start a new poll challenge right now (10 min window).
-- Run in Supabase Dashboard → SQL Editor (postgres) or:
--   supabase db execute --file supabase/scripts/reset_feed_and_new_poll.sql
--
-- Does NOT delete profiles, friendships, or challenges.

BEGIN;

DELETE FROM public.reactions;
DELETE FROM public.posts;
DELETE FROM public.poll_votes;

UPDATE public.poll_options SET vote_count = 0;
UPDATE public.challenges SET participant_count = 0 WHERE type = 'poll';

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
  WHERE c.type = 'poll' AND c.is_active = true
  ORDER BY random()
  LIMIT 1;

  IF ch_id IS NULL THEN
    RAISE EXCEPTION 'No active poll challenge found (challenges.type = poll, is_active = true)';
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

  RAISE NOTICE 'New daily_event % for challenge % (expires %)', de_id, ch_id, expires;
END $$;

COMMIT;
