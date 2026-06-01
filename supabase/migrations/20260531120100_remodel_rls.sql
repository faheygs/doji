-- RLS for remodel: follows, privacy, participation gate, admin, tiered badges

-- ---------------------------------------------------------------------------
-- Follows policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS follows_select ON public.follows;
CREATE POLICY follows_select ON public.follows
  FOR SELECT TO authenticated
  USING (
    follower_id = auth.uid()
    OR following_id = auth.uid()
    OR status = 'accepted'
  );

DROP POLICY IF EXISTS follows_insert ON public.follows;
CREATE POLICY follows_insert ON public.follows
  FOR INSERT TO authenticated
  WITH CHECK (follower_id = auth.uid());

DROP POLICY IF EXISTS follows_update ON public.follows;
CREATE POLICY follows_update ON public.follows
  FOR UPDATE TO authenticated
  USING (following_id = auth.uid() OR follower_id = auth.uid());

DROP POLICY IF EXISTS follows_delete ON public.follows;
CREATE POLICY follows_delete ON public.follows
  FOR DELETE TO authenticated
  USING (follower_id = auth.uid() OR following_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Profiles: respect privacy for non-own reads
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
CREATE POLICY profiles_select_authenticated ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.can_view_profile(auth.uid(), id)
  );

-- ---------------------------------------------------------------------------
-- Posts: participation gate + privacy + follows
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS posts_select ON public.posts;
DROP POLICY IF EXISTS posts_read_friends ON public.posts;
DROP POLICY IF EXISTS posts_read_own ON public.posts;

CREATE POLICY posts_select ON public.posts
  FOR SELECT TO authenticated
  USING (
    public.viewer_completed_today(auth.uid())
    AND (
      user_id = auth.uid()
      OR is_community_poll = true
      OR (
        public.can_view_profile(auth.uid(), user_id)
        AND (
          visibility = 'public'
          OR public.is_following(auth.uid(), user_id)
        )
      )
    )
  );

DROP POLICY IF EXISTS posts_update_own ON public.posts;
CREATE POLICY posts_update_own ON public.posts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Comments: update/delete own; respect comments_disabled
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS comments_update_own ON public.comments;
CREATE POLICY comments_update_own ON public.comments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS comments_delete_own ON public.comments;
CREATE POLICY comments_delete_own ON public.comments
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS comments_insert ON public.comments;
CREATE POLICY comments_insert ON public.comments
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_id AND p.comments_disabled = true AND p.user_id <> auth.uid()
    )
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.posts p
        WHERE p.id = post_id AND p.comments_disabled = true
      )
      OR EXISTS (
        SELECT 1 FROM public.posts p
        WHERE p.id = post_id AND p.user_id = auth.uid()
      )
    )
  );

-- Comment mentions
DROP POLICY IF EXISTS comment_mentions_select ON public.comment_mentions;
CREATE POLICY comment_mentions_select ON public.comment_mentions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS comment_mentions_insert ON public.comment_mentions;
CREATE POLICY comment_mentions_insert ON public.comment_mentions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.comments c
      WHERE c.id = comment_id AND c.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Badge tiers (read-only for users)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS badge_categories_select ON public.badge_categories;
CREATE POLICY badge_categories_select ON public.badge_categories
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS badge_tiers_select ON public.badge_tiers;
CREATE POLICY badge_tiers_select ON public.badge_tiers
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS user_badge_progress_select ON public.user_badge_progress;
CREATE POLICY user_badge_progress_select ON public.user_badge_progress
  FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- Challenge suggestions: admin review
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS challenge_suggestions_select_own ON public.challenge_suggestions;
CREATE POLICY challenge_suggestions_select_own ON public.challenge_suggestions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

DROP POLICY IF EXISTS challenge_suggestions_update_admin ON public.challenge_suggestions;
CREATE POLICY challenge_suggestions_update_admin ON public.challenge_suggestions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

-- ---------------------------------------------------------------------------
-- Upsert badge tier on achievement (called from trigger)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_badge_tier(
  p_user_id uuid,
  p_category_id text,
  p_tier text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order int;
  v_current_order int;
BEGIN
  SELECT sort_order INTO v_order FROM public.badge_tiers
  WHERE category_id = p_category_id AND tier = p_tier;

  SELECT bt.sort_order INTO v_current_order
  FROM public.user_badge_progress ubp
  JOIN public.badge_tiers bt ON bt.category_id = ubp.category_id AND bt.tier = ubp.current_tier
  WHERE ubp.user_id = p_user_id AND ubp.category_id = p_category_id;

  IF v_current_order IS NULL OR v_order > v_current_order THEN
    INSERT INTO public.user_badge_progress (user_id, category_id, current_tier, unlocked_at)
    VALUES (p_user_id, p_category_id, p_tier, now())
    ON CONFLICT (user_id, category_id) DO UPDATE
      SET current_tier = EXCLUDED.current_tier,
          unlocked_at = EXCLUDED.unlocked_at
      WHERE public.user_badge_progress.unlocked_at <= EXCLUDED.unlocked_at;
  END IF;
END;
$$;

-- Award tiered badges on challenge complete (extends existing trigger logic)
CREATE OR REPLACE FUNCTION public.award_tiered_badges_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_streak int;
  v_completions int;
  v_xp int;
  v_recv int;
  v_level int;
  v_followers int;
  v_poll bigint;
  v_given bigint;
BEGIN
  SELECT current_streak, total_completions, xp, reactions_received, level
  INTO v_streak, v_completions, v_xp, v_recv, v_level
  FROM public.profiles WHERE id = p_user_id;

  v_followers := public.follower_count(p_user_id);

  SELECT COUNT(*) INTO v_poll FROM public.poll_votes WHERE user_id = p_user_id;
  SELECT COUNT(*) INTO v_given FROM public.reactions WHERE user_id = p_user_id;

  IF v_streak >= 3 THEN PERFORM public.upsert_badge_tier(p_user_id, 'streak', 'bronze'); END IF;
  IF v_streak >= 7 THEN PERFORM public.upsert_badge_tier(p_user_id, 'streak', 'silver'); END IF;
  IF v_streak >= 30 THEN PERFORM public.upsert_badge_tier(p_user_id, 'streak', 'gold'); END IF;
  IF v_streak >= 100 THEN PERFORM public.upsert_badge_tier(p_user_id, 'streak', 'diamond'); END IF;

  IF v_completions >= 1 THEN PERFORM public.upsert_badge_tier(p_user_id, 'completions', 'bronze'); END IF;
  IF v_completions >= 10 THEN PERFORM public.upsert_badge_tier(p_user_id, 'completions', 'silver'); END IF;
  IF v_completions >= 50 THEN PERFORM public.upsert_badge_tier(p_user_id, 'completions', 'gold'); END IF;
  IF v_completions >= 250 THEN PERFORM public.upsert_badge_tier(p_user_id, 'completions', 'diamond'); END IF;

  IF v_xp >= 1000 THEN PERFORM public.upsert_badge_tier(p_user_id, 'xp', 'bronze'); END IF;
  IF v_xp >= 5000 THEN PERFORM public.upsert_badge_tier(p_user_id, 'xp', 'silver'); END IF;
  IF v_xp >= 10000 THEN PERFORM public.upsert_badge_tier(p_user_id, 'xp', 'gold'); END IF;

  IF v_recv >= 100 THEN PERFORM public.upsert_badge_tier(p_user_id, 'reactions_received', 'bronze'); END IF;
  IF v_recv >= 500 THEN PERFORM public.upsert_badge_tier(p_user_id, 'reactions_received', 'silver'); END IF;
  IF v_recv >= 1000 THEN PERFORM public.upsert_badge_tier(p_user_id, 'reactions_received', 'gold'); END IF;

  IF v_given >= 1 THEN PERFORM public.upsert_badge_tier(p_user_id, 'reactions_given', 'bronze'); END IF;
  IF v_given >= 100 THEN PERFORM public.upsert_badge_tier(p_user_id, 'reactions_given', 'silver'); END IF;

  IF v_poll >= 10 THEN PERFORM public.upsert_badge_tier(p_user_id, 'poll_votes', 'bronze'); END IF;
  IF v_poll >= 50 THEN PERFORM public.upsert_badge_tier(p_user_id, 'poll_votes', 'silver'); END IF;
  IF v_poll >= 100 THEN PERFORM public.upsert_badge_tier(p_user_id, 'poll_votes', 'gold'); END IF;

  IF v_followers >= 1 THEN PERFORM public.upsert_badge_tier(p_user_id, 'social', 'bronze'); END IF;
  IF v_followers >= 10 THEN PERFORM public.upsert_badge_tier(p_user_id, 'social', 'silver'); END IF;
  IF v_followers >= 50 THEN PERFORM public.upsert_badge_tier(p_user_id, 'social', 'gold'); END IF;

  IF v_level >= 5 THEN PERFORM public.upsert_badge_tier(p_user_id, 'level', 'bronze'); END IF;
  IF v_level >= 10 THEN PERFORM public.upsert_badge_tier(p_user_id, 'level', 'silver'); END IF;
END;
$$;

-- Hook tiered badges into user_event completion
CREATE OR REPLACE FUNCTION public.trg_award_tiered_badges() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status = 'pending' THEN
    PERFORM public.award_tiered_badges_for_user(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_event_tiered_badges ON public.user_events;
CREATE TRIGGER user_event_tiered_badges
  AFTER UPDATE OF status ON public.user_events
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_award_tiered_badges();
