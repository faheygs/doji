-- ============================================================================
-- Updated badge check trigger — covers all 25 badge criteria
-- Run AFTER seed_badges migration
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_user_event_complete() RETURNS trigger AS $$
DECLARE
  v_xp_reward integer;
  v_challenge_id uuid;
  v_week date;
  v_new_xp integer;
  v_new_level integer;
  v_streak integer;
  v_completions integer;
  v_poll_count bigint;
  v_recv integer;
  v_friends_count bigint;
BEGIN
  IF (NEW.status IN ('completed', 'late')) AND (OLD.status = 'pending') THEN
    SELECT c.xp_reward, de.challenge_id INTO v_xp_reward, v_challenge_id
      FROM public.daily_events de
      JOIN public.challenges c ON c.id = de.challenge_id
      WHERE de.id = NEW.daily_event_id;

    IF v_xp_reward IS NULL THEN v_xp_reward := 25; END IF;

    UPDATE public.profiles
      SET xp = xp + v_xp_reward
      WHERE id = NEW.user_id
      RETURNING xp, level, current_streak, total_completions, reactions_received
        INTO v_new_xp, v_new_level, v_streak, v_completions, v_recv;

    v_week := date_trunc('week', now())::date;
    INSERT INTO public.weekly_xp (user_id, week_start, xp)
      VALUES (NEW.user_id, v_week, v_xp_reward)
      ON CONFLICT (user_id, week_start)
      DO UPDATE SET xp = public.weekly_xp.xp + v_xp_reward;

    -- ===== Streak badges =====
    IF v_streak >= 3 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'streak_3') ON CONFLICT DO NOTHING;
    END IF;
    IF v_streak >= 7 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'on_fire') ON CONFLICT DO NOTHING;
    END IF;
    IF v_streak >= 14 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'streak_14') ON CONFLICT DO NOTHING;
    END IF;
    IF v_streak >= 30 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'streak_30') ON CONFLICT DO NOTHING;
    END IF;
    IF v_streak >= 100 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'streak_100') ON CONFLICT DO NOTHING;
    END IF;

    -- ===== Completion badges =====
    IF v_completions >= 1 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'first_one') ON CONFLICT DO NOTHING;
    END IF;
    IF v_completions >= 10 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'ten_done') ON CONFLICT DO NOTHING;
    END IF;
    IF v_completions >= 50 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'fifty_done') ON CONFLICT DO NOTHING;
    END IF;
    IF v_completions >= 100 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'century') ON CONFLICT DO NOTHING;
    END IF;
    IF v_completions >= 250 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'two_fifty') ON CONFLICT DO NOTHING;
    END IF;
    IF v_completions >= 500 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'five_hundred') ON CONFLICT DO NOTHING;
    END IF;

    -- ===== XP badges =====
    IF v_new_xp >= 1000 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'xp_1000') ON CONFLICT DO NOTHING;
    END IF;
    IF v_new_xp >= 5000 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'xp_5000') ON CONFLICT DO NOTHING;
    END IF;
    IF v_new_xp >= 10000 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'xp_10000') ON CONFLICT DO NOTHING;
    END IF;

    -- ===== Reaction badges =====
    IF v_recv >= 100 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'beloved_100') ON CONFLICT DO NOTHING;
    END IF;
    IF v_recv >= 500 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'beloved_500') ON CONFLICT DO NOTHING;
    END IF;
    IF v_recv >= 1000 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'beloved') ON CONFLICT DO NOTHING;
    END IF;

    -- ===== Poll badges =====
    SELECT count(*) INTO v_poll_count FROM public.poll_votes WHERE user_id = NEW.user_id;
    IF v_poll_count >= 10 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'poll_10') ON CONFLICT DO NOTHING;
    END IF;
    IF v_poll_count >= 50 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'poll_star') ON CONFLICT DO NOTHING;
    END IF;
    IF v_poll_count >= 100 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'poll_100') ON CONFLICT DO NOTHING;
    END IF;

    -- ===== Level badges =====
    IF v_new_level >= 5 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'level_5') ON CONFLICT DO NOTHING;
    END IF;
    IF v_new_level >= 10 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'level_10') ON CONFLICT DO NOTHING;
    END IF;

    -- ===== Friends badges =====
    SELECT count(*) INTO v_friends_count
      FROM public.friendships
      WHERE status = 'accepted'
        AND (requester_id = NEW.user_id OR addressee_id = NEW.user_id);
    IF v_friends_count >= 1 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'social_1') ON CONFLICT DO NOTHING;
    END IF;
    IF v_friends_count >= 10 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'social_10') ON CONFLICT DO NOTHING;
    END IF;
    IF v_friends_count >= 50 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'social_50') ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_event_complete_trigger ON public.user_events;
CREATE TRIGGER user_event_complete_trigger
  AFTER UPDATE ON public.user_events
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_user_event_complete();
