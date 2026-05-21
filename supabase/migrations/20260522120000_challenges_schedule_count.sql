-- Fair rotation: prefer challenges that have been scheduled the fewest times.
-- New rows (including community suggestions) start at 0; each daily_event assignment increments.

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS schedule_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.challenges.schedule_count IS
  'Number of times this challenge has been assigned to a daily_event. Scheduler picks among active challenges with the lowest count first.';

CREATE INDEX IF NOT EXISTS challenges_active_schedule_idx
  ON public.challenges (is_active, schedule_count ASC, created_at ASC)
  WHERE is_active = true;
