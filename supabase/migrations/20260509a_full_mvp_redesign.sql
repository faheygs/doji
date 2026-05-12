-- ============================================================================
-- Doji Full MVP Redesign Migration
-- Adds: XP/levels, badges, polls, tasks, weekly leaderboard, DB triggers
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. profiles: add gamification columns
-- --------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS xp integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reactions_received integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avatar_gradient text[] NOT NULL DEFAULT ARRAY['#F97316','#8B5CF6'];

-- --------------------------------------------------------------------------
-- 2. challenges: add type, emoji, xp_reward, participant_count
-- --------------------------------------------------------------------------
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'photo',
  ADD COLUMN IF NOT EXISTS emoji text,
  ADD COLUMN IF NOT EXISTS xp_reward integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS participant_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.challenges
  ADD CONSTRAINT challenges_type_check CHECK (type IN ('photo', 'poll', 'task'));

-- --------------------------------------------------------------------------
-- 3. posts: add type and poll answer index
-- --------------------------------------------------------------------------
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'photo',
  ADD COLUMN IF NOT EXISTS selected_option_index integer;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_type_check CHECK (type IN ('photo', 'poll_vote', 'task_complete'));

-- --------------------------------------------------------------------------
-- 4. poll_options table
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  text text NOT NULL,
  vote_count integer NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_poll_options_challenge ON public.poll_options(challenge_id);

-- --------------------------------------------------------------------------
-- 5. poll_votes table
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  challenge_id uuid NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, challenge_id)
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_challenge ON public.poll_votes(challenge_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_option ON public.poll_votes(option_id);

-- --------------------------------------------------------------------------
-- 6. badges table (static definitions)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.badges (
  id text PRIMARY KEY,
  name text NOT NULL,
  emoji text NOT NULL,
  description text NOT NULL,
  criteria_type text NOT NULL,
  criteria_value integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.badges (id, name, emoji, description, criteria_type, criteria_value) VALUES
  ('early_bird',  'Early Bird',  '🐦', 'Respond to a challenge in under 60 seconds',   'response_time_seconds', 60),
  ('on_fire',     'On Fire',     '🔥', 'Achieve a 7-day streak',                        'streak_days',           7),
  ('century',     'Century',     '💯', 'Complete 100 challenges',                        'completions',           100),
  ('poll_star',   'Poll Star',   '⭐', 'Vote in 50 polls',                              'poll_votes',            50),
  ('beloved',     'Beloved',     '👑', 'Receive 1,000 total reactions',                  'reactions_received',    1000),
  ('speedster',   'Speedster',   '⚡', 'Be the first to respond 10 times',              'first_responder',       10)
ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------------------------------------
-- 7. user_badges table
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_badges (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_id text NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  earned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);

-- --------------------------------------------------------------------------
-- 8. weekly_xp table (for leaderboard)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.weekly_xp (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  xp integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_xp_week ON public.weekly_xp(week_start, xp DESC);

-- --------------------------------------------------------------------------
-- 9. Reactions: change constraint to allow multiple types per user per post
-- --------------------------------------------------------------------------
-- Drop old unique constraint if it exists (may vary by name)
DO $$
BEGIN
  -- Try common constraint names
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reactions_post_id_user_id_key') THEN
    ALTER TABLE public.reactions DROP CONSTRAINT reactions_post_id_user_id_key;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reactions_user_id_post_id_key') THEN
    ALTER TABLE public.reactions DROP CONSTRAINT reactions_user_id_post_id_key;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- New: one reaction per type per user per post
CREATE UNIQUE INDEX IF NOT EXISTS reactions_post_user_emoji_uniq
  ON public.reactions(post_id, user_id, emoji);

-- Constrain emoji values
ALTER TABLE public.reactions
  DROP CONSTRAINT IF EXISTS reactions_emoji_check;
ALTER TABLE public.reactions
  ADD CONSTRAINT reactions_emoji_check CHECK (emoji IN ('fire', 'laugh', 'wow', 'love'));

-- --------------------------------------------------------------------------
-- 10. DB Triggers for derived data
-- --------------------------------------------------------------------------

-- 10a. Level calculation function
CREATE OR REPLACE FUNCTION public.level_from_xp(p_xp integer) RETURNS integer AS $$
BEGIN
  RETURN CASE
    WHEN p_xp >= 16000 THEN 10
    WHEN p_xp >= 12000 THEN 9
    WHEN p_xp >= 9000  THEN 8
    WHEN p_xp >= 6500  THEN 7
    WHEN p_xp >= 4500  THEN 6
    WHEN p_xp >= 3000  THEN 5
    WHEN p_xp >= 2000  THEN 4
    WHEN p_xp >= 1200  THEN 3
    WHEN p_xp >= 500   THEN 2
    ELSE 1
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 10b. Auto-recalculate level when XP changes
CREATE OR REPLACE FUNCTION public.trg_profile_xp_level() RETURNS trigger AS $$
BEGIN
  IF NEW.xp IS DISTINCT FROM OLD.xp THEN
    NEW.level := public.level_from_xp(NEW.xp);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profile_xp_level_trigger ON public.profiles;
CREATE TRIGGER profile_xp_level_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_profile_xp_level();

-- 10c. On reaction insert: update post reaction_count + owner's reactions_received
CREATE OR REPLACE FUNCTION public.trg_reaction_insert() RETURNS trigger AS $$
DECLARE
  v_post_owner uuid;
BEGIN
  UPDATE public.posts SET reaction_count = reaction_count + 1 WHERE id = NEW.post_id;
  SELECT user_id INTO v_post_owner FROM public.posts WHERE id = NEW.post_id;
  IF v_post_owner IS NOT NULL THEN
    UPDATE public.profiles SET reactions_received = reactions_received + 1 WHERE id = v_post_owner;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reaction_insert_trigger ON public.reactions;
CREATE TRIGGER reaction_insert_trigger
  AFTER INSERT ON public.reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_reaction_insert();

-- 10d. On reaction delete: decrement counts
CREATE OR REPLACE FUNCTION public.trg_reaction_delete() RETURNS trigger AS $$
DECLARE
  v_post_owner uuid;
BEGIN
  UPDATE public.posts SET reaction_count = GREATEST(0, reaction_count - 1) WHERE id = OLD.post_id;
  SELECT user_id INTO v_post_owner FROM public.posts WHERE id = OLD.post_id;
  IF v_post_owner IS NOT NULL THEN
    UPDATE public.profiles SET reactions_received = GREATEST(0, reactions_received - 1) WHERE id = v_post_owner;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reaction_delete_trigger ON public.reactions;
CREATE TRIGGER reaction_delete_trigger
  AFTER DELETE ON public.reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_reaction_delete();

-- 10e. On poll vote: increment option vote_count + challenge participant_count
CREATE OR REPLACE FUNCTION public.trg_poll_vote_insert() RETURNS trigger AS $$
BEGIN
  UPDATE public.poll_options SET vote_count = vote_count + 1 WHERE id = NEW.option_id;
  UPDATE public.challenges SET participant_count = participant_count + 1
    WHERE id = NEW.challenge_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS poll_vote_insert_trigger ON public.poll_votes;
CREATE TRIGGER poll_vote_insert_trigger
  AFTER INSERT ON public.poll_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_poll_vote_insert();

-- 10f. On post insert: increment challenge participant_count (photo/task)
CREATE OR REPLACE FUNCTION public.trg_post_insert_participant() RETURNS trigger AS $$
DECLARE
  v_challenge_id uuid;
BEGIN
  IF NEW.type IN ('photo', 'task_complete') THEN
    SELECT de.challenge_id INTO v_challenge_id
      FROM public.user_events ue
      JOIN public.daily_events de ON de.id = ue.daily_event_id
      WHERE ue.id = NEW.user_event_id;
    IF v_challenge_id IS NOT NULL THEN
      UPDATE public.challenges SET participant_count = participant_count + 1
        WHERE id = v_challenge_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS post_insert_participant_trigger ON public.posts;
CREATE TRIGGER post_insert_participant_trigger
  AFTER INSERT ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_post_insert_participant();

-- 10g. On user_event status change to completed/late: award XP + weekly_xp + badge check
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
BEGIN
  IF (NEW.status IN ('completed', 'late')) AND (OLD.status = 'pending') THEN
    -- Get XP reward from challenge
    SELECT c.xp_reward, de.challenge_id INTO v_xp_reward, v_challenge_id
      FROM public.daily_events de
      JOIN public.challenges c ON c.id = de.challenge_id
      WHERE de.id = NEW.daily_event_id;

    IF v_xp_reward IS NULL THEN v_xp_reward := 25; END IF;

    -- Award XP
    UPDATE public.profiles
      SET xp = xp + v_xp_reward
      WHERE id = NEW.user_id
      RETURNING xp, current_streak, total_completions, reactions_received
        INTO v_new_xp, v_streak, v_completions, v_recv;

    -- Upsert weekly_xp
    v_week := date_trunc('week', now())::date;
    INSERT INTO public.weekly_xp (user_id, week_start, xp)
      VALUES (NEW.user_id, v_week, v_xp_reward)
      ON CONFLICT (user_id, week_start)
      DO UPDATE SET xp = public.weekly_xp.xp + v_xp_reward;

    -- Badge checks
    -- on_fire: 7-day streak
    IF v_streak >= 7 THEN
      INSERT INTO public.user_badges (user_id, badge_id)
        VALUES (NEW.user_id, 'on_fire')
        ON CONFLICT DO NOTHING;
    END IF;

    -- century: 100 completions
    IF v_completions >= 100 THEN
      INSERT INTO public.user_badges (user_id, badge_id)
        VALUES (NEW.user_id, 'century')
        ON CONFLICT DO NOTHING;
    END IF;

    -- beloved: 1000 reactions received
    IF v_recv >= 1000 THEN
      INSERT INTO public.user_badges (user_id, badge_id)
        VALUES (NEW.user_id, 'beloved')
        ON CONFLICT DO NOTHING;
    END IF;

    -- poll_star: 50 poll votes
    SELECT count(*) INTO v_poll_count FROM public.poll_votes WHERE user_id = NEW.user_id;
    IF v_poll_count >= 50 THEN
      INSERT INTO public.user_badges (user_id, badge_id)
        VALUES (NEW.user_id, 'poll_star')
        ON CONFLICT DO NOTHING;
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

-- --------------------------------------------------------------------------
-- 11. RLS Policies for new tables
-- --------------------------------------------------------------------------
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_xp ENABLE ROW LEVEL SECURITY;

-- poll_options: anyone authenticated can read
CREATE POLICY "poll_options_select" ON public.poll_options
  FOR SELECT TO authenticated USING (true);

-- poll_votes: users can read all, insert own
CREATE POLICY "poll_votes_select" ON public.poll_votes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "poll_votes_insert" ON public.poll_votes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- badges: anyone authenticated can read
CREATE POLICY "badges_select" ON public.badges
  FOR SELECT TO authenticated USING (true);

-- user_badges: anyone authenticated can read
CREATE POLICY "user_badges_select" ON public.user_badges
  FOR SELECT TO authenticated USING (true);

-- weekly_xp: anyone authenticated can read
CREATE POLICY "weekly_xp_select" ON public.weekly_xp
  FOR SELECT TO authenticated USING (true);

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.poll_options;
ALTER PUBLICATION supabase_realtime ADD TABLE public.poll_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_badges;
ALTER PUBLICATION supabase_realtime ADD TABLE public.weekly_xp;

COMMIT;
