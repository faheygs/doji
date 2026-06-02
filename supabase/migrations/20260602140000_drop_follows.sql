-- Remove follows model entirely; friends-only social.

DROP TRIGGER IF EXISTS follows_new_follower_push ON public.follows;
DROP TRIGGER IF EXISTS follows_request_push ON public.follows;
DROP TRIGGER IF EXISTS follows_accepted_push ON public.follows;

DROP FUNCTION IF EXISTS public.trg_follow_new_follower_push();
DROP FUNCTION IF EXISTS public.trg_follow_request_push();
DROP FUNCTION IF EXISTS public.trg_follow_accepted_push();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'follows'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.follows;
  END IF;
END $$;

DROP TABLE IF EXISTS public.follows CASCADE;

DROP FUNCTION IF EXISTS public.is_following(uuid, uuid);
DROP FUNCTION IF EXISTS public.follower_count(uuid);
DROP FUNCTION IF EXISTS public.following_count(uuid);

UPDATE public.badge_tiers
SET criteria_type = 'friends_count'
WHERE criteria_type = 'followers_count';

UPDATE public.badge_categories
SET description = 'Mutual friends on Doji'
WHERE id = 'social';

UPDATE public.profiles
SET notification_preferences = notification_preferences
  - 'follow_request'
  - 'follow_accepted'
  - 'new_follower'
WHERE notification_preferences ?| ARRAY['follow_request', 'follow_accepted', 'new_follower'];

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
  v_friends int;
  v_poll bigint;
  v_given bigint;
BEGIN
  SELECT current_streak, total_completions, xp, reactions_received, level
  INTO v_streak, v_completions, v_xp, v_recv, v_level
  FROM public.profiles WHERE id = p_user_id;

  v_friends := public.friend_count(p_user_id);

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

  IF v_friends >= 1 THEN PERFORM public.upsert_badge_tier(p_user_id, 'social', 'bronze'); END IF;
  IF v_friends >= 10 THEN PERFORM public.upsert_badge_tier(p_user_id, 'social', 'silver'); END IF;
  IF v_friends >= 50 THEN PERFORM public.upsert_badge_tier(p_user_id, 'social', 'gold'); END IF;

  IF v_level >= 5 THEN PERFORM public.upsert_badge_tier(p_user_id, 'level', 'bronze'); END IF;
  IF v_level >= 10 THEN PERFORM public.upsert_badge_tier(p_user_id, 'level', 'silver'); END IF;
END;
$$;
