-- ============================================================================
-- Add missing INSERT policies for dev tools + normal app flow
-- ============================================================================

-- user_badges: authenticated users can insert their own badges
DROP POLICY IF EXISTS "user_badges_insert_own" ON public.user_badges;
CREATE POLICY "user_badges_insert_own" ON public.user_badges
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- user_badges: authenticated users can delete their own badges (for reset)
DROP POLICY IF EXISTS "user_badges_delete_own" ON public.user_badges;
CREATE POLICY "user_badges_delete_own" ON public.user_badges
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- daily_events: authenticated users can insert (needed for dev tools trigger)
DROP POLICY IF EXISTS "daily_events_insert_auth" ON public.daily_events;
CREATE POLICY "daily_events_insert_auth" ON public.daily_events
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- daily_events: broaden SELECT so user can see events even before user_event exists
DROP POLICY IF EXISTS "daily_events_select_all" ON public.daily_events;
CREATE POLICY "daily_events_select_all" ON public.daily_events
  FOR SELECT TO authenticated
  USING (true);

-- user_events: authenticated users can insert their own
DROP POLICY IF EXISTS "user_events_insert_own" ON public.user_events;
CREATE POLICY "user_events_insert_own" ON public.user_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- user_events: authenticated users can delete their own (for reset)
DROP POLICY IF EXISTS "user_events_delete_own" ON public.user_events;
CREATE POLICY "user_events_delete_own" ON public.user_events
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- challenges: authenticated users can insert (needed for dev tools)
DROP POLICY IF EXISTS "challenges_insert_auth" ON public.challenges;
CREATE POLICY "challenges_insert_auth" ON public.challenges
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- poll_options: authenticated users can insert (needed for dev tools poll creation)
DROP POLICY IF EXISTS "poll_options_insert_auth" ON public.poll_options;
CREATE POLICY "poll_options_insert_auth" ON public.poll_options
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- weekly_xp: authenticated users can delete their own (for reset)
DROP POLICY IF EXISTS "weekly_xp_delete_own" ON public.weekly_xp;
CREATE POLICY "weekly_xp_delete_own" ON public.weekly_xp
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- poll_votes: authenticated users can delete their own (for reset)
DROP POLICY IF EXISTS "poll_votes_delete_own" ON public.poll_votes;
CREATE POLICY "poll_votes_delete_own" ON public.poll_votes
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- streak_events: authenticated users can delete their own (for reset)
DROP POLICY IF EXISTS "streak_events_delete_own" ON public.streak_events;
CREATE POLICY "streak_events_delete_own" ON public.streak_events
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
