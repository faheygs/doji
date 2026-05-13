BEGIN;

-- Fix the user_event completion trigger to also increment total_completions
-- and update current_streak / longest_streak.
CREATE OR REPLACE FUNCTION public.trg_user_event_complete() RETURNS trigger AS $$
DECLARE
  v_xp_reward integer;
  v_challenge_id uuid;
  v_week date;
  v_new_xp integer;
  v_streak integer;
  v_completions integer;
  v_poll_count bigint;
  v_recv integer;
  v_last_completed date;
  v_today date;
BEGIN
  IF (NEW.status IN ('completed', 'late')) AND (OLD.status = 'pending') THEN
    SELECT c.xp_reward, de.challenge_id INTO v_xp_reward, v_challenge_id
      FROM public.daily_events de
      JOIN public.challenges c ON c.id = de.challenge_id
      WHERE de.id = NEW.daily_event_id;

    IF v_xp_reward IS NULL THEN v_xp_reward := 25; END IF;

    -- Check yesterday's completion for streak
    v_today := current_date;

    SELECT MAX(ue.completed_at::date) INTO v_last_completed
      FROM public.user_events ue
      WHERE ue.user_id = NEW.user_id
        AND ue.status IN ('completed', 'late')
        AND ue.id != NEW.id;

    -- Award XP + increment completions + update streak
    IF v_last_completed = v_today - interval '1 day' THEN
      UPDATE public.profiles
        SET xp = xp + v_xp_reward,
            total_completions = total_completions + 1,
            current_streak = current_streak + 1,
            longest_streak = GREATEST(longest_streak, current_streak + 1)
        WHERE id = NEW.user_id
        RETURNING xp, current_streak, total_completions, reactions_received
          INTO v_new_xp, v_streak, v_completions, v_recv;
    ELSIF v_last_completed = v_today THEN
      -- Already completed one today, just add XP
      UPDATE public.profiles
        SET xp = xp + v_xp_reward,
            total_completions = total_completions + 1
        WHERE id = NEW.user_id
        RETURNING xp, current_streak, total_completions, reactions_received
          INTO v_new_xp, v_streak, v_completions, v_recv;
    ELSE
      -- Streak broken or first completion, reset to 1
      UPDATE public.profiles
        SET xp = xp + v_xp_reward,
            total_completions = total_completions + 1,
            current_streak = 1,
            longest_streak = GREATEST(longest_streak, 1)
        WHERE id = NEW.user_id
        RETURNING xp, current_streak, total_completions, reactions_received
          INTO v_new_xp, v_streak, v_completions, v_recv;
    END IF;

    -- Upsert weekly_xp
    v_week := date_trunc('week', now())::date;
    INSERT INTO public.weekly_xp (user_id, week_start, xp)
      VALUES (NEW.user_id, v_week, v_xp_reward)
      ON CONFLICT (user_id, week_start)
      DO UPDATE SET xp = public.weekly_xp.xp + v_xp_reward;

    -- Badge checks
    IF v_streak >= 7 THEN
      INSERT INTO public.user_badges (user_id, badge_id)
        VALUES (NEW.user_id, 'on_fire')
        ON CONFLICT DO NOTHING;
    END IF;

    IF v_completions >= 100 THEN
      INSERT INTO public.user_badges (user_id, badge_id)
        VALUES (NEW.user_id, 'century')
        ON CONFLICT DO NOTHING;
    END IF;

    IF v_recv >= 1000 THEN
      INSERT INTO public.user_badges (user_id, badge_id)
        VALUES (NEW.user_id, 'beloved')
        ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
