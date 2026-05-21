-- Restore full badge awards on challenge completion (12200000 had replaced this with a stub).
-- One reaction per user per post (any emoji).
-- Challenge idea submissions pool + badges.

-- ---------------------------------------------------------------------------
-- Reactions: one row per (post_id, user_id)
-- ---------------------------------------------------------------------------
DELETE FROM public.reactions r
 WHERE r.id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY post_id, user_id ORDER BY created_at DESC) AS rn
      FROM public.reactions
  ) x WHERE rn > 1
);

DROP INDEX IF EXISTS public.reactions_post_user_emoji_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS reactions_post_user_uniq
  ON public.reactions (post_id, user_id);

-- ---------------------------------------------------------------------------
-- Merge streak + completion logic with full badge inserts
-- ---------------------------------------------------------------------------
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
  v_last_completed date;
  v_today date;
BEGIN
  IF (NEW.status IN ('completed', 'late')) AND (OLD.status = 'pending') THEN
    SELECT c.xp_reward, de.challenge_id INTO v_xp_reward, v_challenge_id
      FROM public.daily_events de
      JOIN public.challenges c ON c.id = de.challenge_id
      WHERE de.id = NEW.daily_event_id;

    IF v_xp_reward IS NULL THEN v_xp_reward := 25; END IF;

    v_today := current_date;

    SELECT MAX(ue.completed_at::date) INTO v_last_completed
      FROM public.user_events ue
      WHERE ue.user_id = NEW.user_id
        AND ue.status IN ('completed', 'late')
        AND ue.id != NEW.id;

    IF v_last_completed = v_today - interval '1 day' THEN
      UPDATE public.profiles
        SET xp = xp + v_xp_reward,
            total_completions = total_completions + 1,
            current_streak = current_streak + 1,
            longest_streak = GREATEST(longest_streak, current_streak + 1)
        WHERE id = NEW.user_id
        RETURNING xp, level, current_streak, total_completions, reactions_received
          INTO v_new_xp, v_new_level, v_streak, v_completions, v_recv;
    ELSIF v_last_completed = v_today THEN
      UPDATE public.profiles
        SET xp = xp + v_xp_reward,
            total_completions = total_completions + 1
        WHERE id = NEW.user_id
        RETURNING xp, level, current_streak, total_completions, reactions_received
          INTO v_new_xp, v_new_level, v_streak, v_completions, v_recv;
    ELSE
      UPDATE public.profiles
        SET xp = xp + v_xp_reward,
            total_completions = total_completions + 1,
            current_streak = 1,
            longest_streak = GREATEST(longest_streak, 1)
        WHERE id = NEW.user_id
        RETURNING xp, level, current_streak, total_completions, reactions_received
          INTO v_new_xp, v_new_level, v_streak, v_completions, v_recv;
    END IF;

    v_week := date_trunc('week', now())::date;
    INSERT INTO public.weekly_xp (user_id, week_start, xp)
      VALUES (NEW.user_id, v_week, v_xp_reward)
      ON CONFLICT (user_id, week_start)
      DO UPDATE SET xp = public.weekly_xp.xp + v_xp_reward;

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

    IF v_new_xp >= 1000 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'xp_1000') ON CONFLICT DO NOTHING;
    END IF;
    IF v_new_xp >= 5000 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'xp_5000') ON CONFLICT DO NOTHING;
    END IF;
    IF v_new_xp >= 10000 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'xp_10000') ON CONFLICT DO NOTHING;
    END IF;

    IF v_recv >= 100 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'beloved_100') ON CONFLICT DO NOTHING;
    END IF;
    IF v_recv >= 500 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'beloved_500') ON CONFLICT DO NOTHING;
    END IF;
    IF v_recv >= 1000 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'beloved') ON CONFLICT DO NOTHING;
    END IF;

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

    IF v_new_level >= 5 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'level_5') ON CONFLICT DO NOTHING;
    END IF;
    IF v_new_level >= 10 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'level_10') ON CONFLICT DO NOTHING;
    END IF;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- Challenge suggestions (community pool ideas; global dedupe on body_hash)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.challenge_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('poll', 'wyr', 'question', 'photo_idea')),
  body text NOT NULL,
  body_hash text NOT NULL,
  admin_note text,
  selected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT challenge_suggestions_body_hash_key UNIQUE (body_hash)
);

CREATE INDEX IF NOT EXISTS challenge_suggestions_user_id_idx ON public.challenge_suggestions (user_id);

ALTER TABLE public.challenge_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS challenge_suggestions_select_own ON public.challenge_suggestions;
CREATE POLICY challenge_suggestions_select_own ON public.challenge_suggestions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS challenge_suggestions_insert_own ON public.challenge_suggestions;
CREATE POLICY challenge_suggestions_insert_own ON public.challenge_suggestions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

INSERT INTO public.badges (id, name, emoji, description, criteria_type, criteria_value) VALUES
  ('idea_submitted', 'Pitch Perfect', '💡', 'Submitted an idea to the challenge pool', 'challenge_idea', 1),
  ('idea_picked', 'Spotlight', '✨', 'Your challenge idea was selected for a daily Doji', 'challenge_idea_picked', 1)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.trg_challenge_suggestion_badges() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.user_badges (user_id, badge_id)
      VALUES (NEW.user_id, 'idea_submitted')
      ON CONFLICT (user_id, badge_id) DO NOTHING;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.selected_at IS NOT NULL AND (OLD.selected_at IS NULL) THEN
    INSERT INTO public.user_badges (user_id, badge_id)
      VALUES (NEW.user_id, 'idea_picked')
      ON CONFLICT (user_id, badge_id) DO NOTHING;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS challenge_suggestion_badges_trigger ON public.challenge_suggestions;
CREATE TRIGGER challenge_suggestion_badges_trigger
  AFTER INSERT OR UPDATE ON public.challenge_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_challenge_suggestion_badges();

-- Allow either party to end an accepted friendship (unfriend)
DROP POLICY IF EXISTS friendships_delete_party ON public.friendships;
CREATE POLICY friendships_delete_party ON public.friendships
  FOR DELETE USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
