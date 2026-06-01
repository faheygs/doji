-- Doji remodel: follows, privacy, admin, tiered badges, reactions, comments, suggestions

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- ---------------------------------------------------------------------------
-- Follows (Instagram-style; replaces friendships for new code)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  UNIQUE (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

CREATE INDEX IF NOT EXISTS follows_follower_idx ON public.follows (follower_id, status);
CREATE INDEX IF NOT EXISTS follows_following_idx ON public.follows (following_id, status);

-- Migrate accepted friendships → bidirectional accepted follows
INSERT INTO public.follows (follower_id, following_id, status, created_at, accepted_at)
SELECT f.requester_id, f.addressee_id, 'accepted', f.created_at, COALESCE(f.accepted_at, f.created_at)
FROM public.friendships f
WHERE f.status = 'accepted'
ON CONFLICT (follower_id, following_id) DO NOTHING;

INSERT INTO public.follows (follower_id, following_id, status, created_at, accepted_at)
SELECT f.addressee_id, f.requester_id, 'accepted', f.created_at, COALESCE(f.accepted_at, f.created_at)
FROM public.friendships f
WHERE f.status = 'accepted'
ON CONFLICT (follower_id, following_id) DO NOTHING;

-- Pending friend requests → pending follow (requester → addressee)
INSERT INTO public.follows (follower_id, following_id, status, created_at)
SELECT f.requester_id, f.addressee_id, 'pending', f.created_at
FROM public.friendships f
WHERE f.status = 'pending'
ON CONFLICT (follower_id, following_id) DO NOTHING;

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Posts & comments
-- ---------------------------------------------------------------------------
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS comments_disabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS body_edited boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.comment_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, mentioned_user_id)
);

CREATE INDEX IF NOT EXISTS comment_mentions_user_idx ON public.comment_mentions (mentioned_user_id);

ALTER TABLE public.comment_mentions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Reactions emoji remap: fire, dead, laugh, wow, goat, heart
-- Drop constraint first so intermediate values (heart, dead) are allowed.
-- ---------------------------------------------------------------------------
ALTER TABLE public.reactions DROP CONSTRAINT IF EXISTS reactions_emoji_check;

UPDATE public.reactions SET emoji = 'heart' WHERE emoji IN ('like', 'love');
UPDATE public.reactions SET emoji = 'dead' WHERE emoji = 'dislike';

ALTER TABLE public.reactions
  ADD CONSTRAINT reactions_emoji_check
  CHECK (emoji IN ('fire', 'dead', 'laugh', 'wow', 'goat', 'heart'));

-- ---------------------------------------------------------------------------
-- Challenge suggestions approval
-- ---------------------------------------------------------------------------
ALTER TABLE public.challenge_suggestions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id);

ALTER TABLE public.challenge_suggestions DROP CONSTRAINT IF EXISTS challenge_suggestions_status_check;
ALTER TABLE public.challenge_suggestions
  ADD CONSTRAINT challenge_suggestions_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

UPDATE public.challenge_suggestions
SET status = 'approved', reviewed_at = selected_at
WHERE selected_at IS NOT NULL AND status = 'pending';

-- ---------------------------------------------------------------------------
-- Tiered badges
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.badge_categories (
  id text PRIMARY KEY,
  name text NOT NULL,
  emoji text NOT NULL,
  description text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.badge_tiers (
  id text PRIMARY KEY,
  category_id text NOT NULL REFERENCES public.badge_categories(id) ON DELETE CASCADE,
  tier text NOT NULL CHECK (tier IN ('bronze', 'silver', 'gold', 'diamond')),
  criteria_type text NOT NULL,
  criteria_value int NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE (category_id, tier)
);

CREATE TABLE IF NOT EXISTS public.user_badge_progress (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category_id text NOT NULL REFERENCES public.badge_categories(id) ON DELETE CASCADE,
  current_tier text NOT NULL CHECK (current_tier IN ('bronze', 'silver', 'gold', 'diamond')),
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category_id)
);

INSERT INTO public.badge_categories (id, name, emoji, description, sort_order) VALUES
  ('streak', 'Inferno', '🔥', 'Keep your daily streak alive', 1),
  ('completions', 'Dedicated', '🎯', 'Complete daily challenges', 2),
  ('xp', 'Rising Star', '⬆️', 'Earn total XP', 3),
  ('reactions_received', 'Beloved', '💕', 'Reactions on your posts', 4),
  ('reactions_given', 'Cheerleader', '📣', 'Reactions you give others', 5),
  ('poll_votes', 'Opinion Haver', '🗳️', 'Votes in community polls', 6),
  ('social', 'Connected', '🤝', 'People who follow you', 7),
  ('level', 'Leveling Up', '🎮', 'Reach new levels', 8),
  ('ideas', 'Idea Machine', '💡', 'Submit challenge ideas', 9)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.badge_tiers (id, category_id, tier, criteria_type, criteria_value, sort_order) VALUES
  ('streak_bronze', 'streak', 'bronze', 'streak_days', 3, 1),
  ('streak_silver', 'streak', 'silver', 'streak_days', 7, 2),
  ('streak_gold', 'streak', 'gold', 'streak_days', 30, 3),
  ('streak_diamond', 'streak', 'diamond', 'streak_days', 100, 4),
  ('comp_bronze', 'completions', 'bronze', 'completions', 1, 1),
  ('comp_silver', 'completions', 'silver', 'completions', 10, 2),
  ('comp_gold', 'completions', 'gold', 'completions', 50, 3),
  ('comp_diamond', 'completions', 'diamond', 'completions', 250, 4),
  ('xp_bronze', 'xp', 'bronze', 'total_xp', 1000, 1),
  ('xp_silver', 'xp', 'silver', 'total_xp', 5000, 2),
  ('xp_gold', 'xp', 'gold', 'total_xp', 10000, 3),
  ('recv_bronze', 'reactions_received', 'bronze', 'reactions_received', 100, 1),
  ('recv_silver', 'reactions_received', 'silver', 'reactions_received', 500, 2),
  ('recv_gold', 'reactions_received', 'gold', 'reactions_received', 1000, 3),
  ('give_bronze', 'reactions_given', 'bronze', 'reactions_given', 1, 1),
  ('give_silver', 'reactions_given', 'silver', 'reactions_given', 100, 2),
  ('poll_bronze', 'poll_votes', 'bronze', 'poll_votes', 10, 1),
  ('poll_silver', 'poll_votes', 'silver', 'poll_votes', 50, 2),
  ('poll_gold', 'poll_votes', 'gold', 'poll_votes', 100, 3),
  ('social_bronze', 'social', 'bronze', 'followers_count', 1, 1),
  ('social_silver', 'social', 'silver', 'followers_count', 10, 2),
  ('social_gold', 'social', 'gold', 'followers_count', 50, 3),
  ('level_bronze', 'level', 'bronze', 'level_reached', 5, 1),
  ('level_silver', 'level', 'silver', 'level_reached', 10, 2),
  ('ideas_bronze', 'ideas', 'bronze', 'ideas_submitted', 1, 1),
  ('ideas_silver', 'ideas', 'silver', 'ideas_picked', 1, 2)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.badge_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badge_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badge_progress ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_following(p_viewer uuid, p_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.follows f
    WHERE f.follower_id = p_viewer
      AND f.following_id = p_target
      AND f.status = 'accepted'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_profile(p_viewer uuid, p_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_viewer = p_target
    OR NOT COALESCE((SELECT is_private FROM public.profiles WHERE id = p_target), false)
    OR public.is_following(p_viewer, p_target);
$$;

CREATE OR REPLACE FUNCTION public.viewer_completed_today(p_viewer uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_events ue
    JOIN public.daily_events de ON de.id = ue.daily_event_id
    WHERE ue.user_id = p_viewer
      AND ue.status = 'completed'
      AND de.fires_at >= date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles')
      AND de.fires_at < date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles') + interval '1 day'
  );
$$;

CREATE OR REPLACE FUNCTION public.follower_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int FROM public.follows
  WHERE following_id = p_user_id AND status = 'accepted';
$$;

CREATE OR REPLACE FUNCTION public.following_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int FROM public.follows
  WHERE follower_id = p_user_id AND status = 'accepted';
$$;

GRANT EXECUTE ON FUNCTION public.is_following(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_profile(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.viewer_completed_today(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.follower_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.following_count(uuid) TO authenticated;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.follows;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_badge_progress;
