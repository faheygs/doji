-- App Store readiness: dispatch pushes when fires_at elapses (not when the schedule job runs).
-- Apply after core tables exist: daily_events, challenges, user_events, profiles, streak_events.

ALTER TABLE public.daily_events
  ADD COLUMN IF NOT EXISTS push_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.daily_events.push_sent_at IS
  'Timestamp when dispatch-challenge-pushes successfully processed Expo delivery for this event.';

CREATE INDEX IF NOT EXISTS daily_events_push_pending_idx
  ON public.daily_events (fires_at)
  WHERE push_sent_at IS NULL;

-- RLS: tighten client access (service role used by Edge Functions bypasses RLS).

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streak_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS user_events_select_own ON public.user_events;
CREATE POLICY user_events_select_own ON public.user_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_events_update_own ON public.user_events;
CREATE POLICY user_events_update_own ON public.user_events
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS daily_events_select_participant ON public.daily_events;
CREATE POLICY daily_events_select_participant ON public.daily_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_events ue
      WHERE ue.daily_event_id = daily_events.id AND ue.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS streak_events_select_own ON public.streak_events;
CREATE POLICY streak_events_select_own ON public.streak_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS challenges_select_authenticated ON public.challenges;
CREATE POLICY challenges_select_authenticated ON public.challenges
  FOR SELECT TO authenticated
  USING (true);
