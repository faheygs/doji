-- Community poll / WYR: one post per daily_event (aggregated). Per-user poll_vote posts removed.

-- 1) Columns ----------------------------------------------------------------
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_community_poll boolean NOT NULL DEFAULT false;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS daily_event_id uuid REFERENCES public.daily_events(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.posts.is_community_poll IS 'True for the single shared feed card for poll/WYR challenges.';
COMMENT ON COLUMN public.posts.daily_event_id IS 'Set when is_community_poll; ties the card to that drop.';

-- Remove per-user poll posts (feed will use one community card per daily_event).
DELETE FROM public.posts WHERE type = 'poll_vote' AND COALESCE(is_community_poll, false) = false;

-- Allow community rows without user_event / user (RLS insert only via DEFINER trigger).
ALTER TABLE public.posts ALTER COLUMN user_event_id DROP NOT NULL;
ALTER TABLE public.posts ALTER COLUMN user_id DROP NOT NULL;

-- One community card per daily_event
CREATE UNIQUE INDEX IF NOT EXISTS posts_one_community_poll_per_daily_event
  ON public.posts (daily_event_id)
  WHERE is_community_poll = true AND daily_event_id IS NOT NULL;

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_user_or_community_check;
ALTER TABLE public.posts ADD CONSTRAINT posts_user_or_community_check CHECK (
  (is_community_poll = true AND daily_event_id IS NOT NULL AND user_event_id IS NULL AND user_id IS NULL)
  OR
  (is_community_poll = false AND user_event_id IS NOT NULL AND user_id IS NOT NULL AND daily_event_id IS NULL)
);

-- 2) Reactions: do not bump reactions_received for community poll cards ----------
CREATE OR REPLACE FUNCTION public.trg_reaction_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_post_owner uuid;
  v_community boolean;
BEGIN
  UPDATE public.posts SET reaction_count = reaction_count + 1 WHERE id = NEW.post_id;
  SELECT user_id, COALESCE(is_community_poll, false)
    INTO v_post_owner, v_community
  FROM public.posts WHERE id = NEW.post_id;
  IF v_post_owner IS NOT NULL AND NOT v_community THEN
    UPDATE public.profiles SET reactions_received = reactions_received + 1 WHERE id = v_post_owner;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_reaction_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_post_owner uuid;
  v_community boolean;
BEGIN
  UPDATE public.posts SET reaction_count = GREATEST(0, reaction_count - 1) WHERE id = OLD.post_id;
  SELECT user_id, COALESCE(is_community_poll, false)
    INTO v_post_owner, v_community
  FROM public.posts WHERE id = OLD.post_id;
  IF v_post_owner IS NOT NULL AND NOT v_community THEN
    UPDATE public.profiles SET reactions_received = GREATEST(0, reactions_received - 1) WHERE id = v_post_owner;
  END IF;
  RETURN OLD;
END;
$$;

-- 3) Participant trigger: community posts skip ---------------------------------
CREATE OR REPLACE FUNCTION public.trg_post_insert_participant() RETURNS trigger AS $$
DECLARE
  v_challenge_id uuid;
BEGIN
  IF NEW.is_community_poll OR NEW.user_event_id IS NULL THEN
    RETURN NEW;
  END IF;
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

-- 4) Purge: include community posts (no user_events row) -------------------------
CREATE OR REPLACE FUNCTION public.trg_purge_posts_before_new_challenge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.posts WHERE daily_event_id IN (
    SELECT de.id FROM public.daily_events de WHERE de.fires_at < NEW.fires_at
  );
  DELETE FROM public.posts p
  USING public.user_events ue
  JOIN public.daily_events de ON de.id = ue.daily_event_id
  WHERE p.user_event_id = ue.id
    AND de.fires_at < NEW.fires_at;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_posts_older_than_24h()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n int; n2 int;
BEGIN
  DELETE FROM public.posts WHERE daily_event_id IN (
    SELECT id FROM public.daily_events WHERE fires_at < now() - interval '24 hours'
  );
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM public.posts p
  USING public.user_events ue
  JOIN public.daily_events de ON de.id = ue.daily_event_id
  WHERE p.user_event_id = ue.id
    AND de.fires_at < now() - interval '24 hours';
  GET DIAGNOSTICS n2 = ROW_COUNT;
  RETURN n + n2;
END;
$$;

-- 5) Create community poll post when a poll daily_event is scheduled ------------
CREATE OR REPLACE FUNCTION public.trg_daily_event_create_community_poll_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
BEGIN
  SELECT c.type INTO v_type FROM public.challenges c WHERE c.id = NEW.challenge_id;
  IF v_type = 'poll' THEN
    INSERT INTO public.posts (
      user_event_id,
      user_id,
      type,
      daily_event_id,
      is_community_poll,
      is_late,
      visibility,
      selected_option_index
    ) VALUES (
      NULL,
      NULL,
      'poll_vote',
      NEW.id,
      true,
      false,
      'public',
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS daily_event_create_community_poll_post ON public.daily_events;
CREATE TRIGGER daily_event_create_community_poll_post
  AFTER INSERT ON public.daily_events
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_daily_event_create_community_poll_post();

-- 6) Backfill community posts for existing poll daily_events --------------------
INSERT INTO public.posts (
  user_event_id,
  user_id,
  type,
  daily_event_id,
  is_community_poll,
  is_late,
  visibility,
  selected_option_index
)
SELECT
  NULL,
  NULL,
  'poll_vote',
  de.id,
  true,
  false,
  'public',
  NULL
FROM public.daily_events de
JOIN public.challenges c ON c.id = de.challenge_id AND c.type = 'poll'
WHERE NOT EXISTS (
  SELECT 1 FROM public.posts p
  WHERE p.daily_event_id = de.id AND p.is_community_poll = true
);
