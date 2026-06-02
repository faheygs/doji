-- Revert to mutual friendships, remove private/follow model, fix participation grace, expand Sparks.

-- ---------------------------------------------------------------------------
-- 1a. Migrate follows → friendships
-- ---------------------------------------------------------------------------

-- Mutual accepted follows → accepted friendship (stable ordering)
INSERT INTO public.friendships (requester_id, addressee_id, status, created_at, accepted_at)
SELECT
  LEAST(a.follower_id, a.following_id),
  GREATEST(a.follower_id, a.following_id),
  'accepted',
  LEAST(a.created_at, b.created_at),
  GREATEST(COALESCE(a.accepted_at, a.created_at), COALESCE(b.accepted_at, b.created_at))
FROM public.follows a
JOIN public.follows b
  ON a.follower_id = b.following_id
 AND a.following_id = b.follower_id
 AND a.status = 'accepted'
 AND b.status = 'accepted'
WHERE a.follower_id < a.following_id
ON CONFLICT DO NOTHING;

-- One-way accepted follow → pending friendship (follower requests addressee)
INSERT INTO public.friendships (requester_id, addressee_id, status, created_at)
SELECT f.follower_id, f.following_id, 'pending', f.created_at
FROM public.follows f
WHERE f.status = 'accepted'
  AND NOT EXISTS (
    SELECT 1 FROM public.follows r
    WHERE r.follower_id = f.following_id
      AND r.following_id = f.follower_id
      AND r.status = 'accepted'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.friendships fr
    WHERE (fr.requester_id = f.follower_id AND fr.addressee_id = f.following_id)
       OR (fr.requester_id = f.following_id AND fr.addressee_id = f.follower_id)
  )
ON CONFLICT DO NOTHING;

-- Pending follows → pending friendships
INSERT INTO public.friendships (requester_id, addressee_id, status, created_at)
SELECT f.follower_id, f.following_id, 'pending', f.created_at
FROM public.follows f
WHERE f.status = 'pending'
  AND NOT EXISTS (
    SELECT 1 FROM public.friendships fr
    WHERE (fr.requester_id = f.follower_id AND fr.addressee_id = f.following_id)
       OR (fr.requester_id = f.following_id AND fr.addressee_id = f.follower_id)
  )
ON CONFLICT DO NOTHING;

-- Drop follow-based push triggers
DROP TRIGGER IF EXISTS follows_request_push ON public.follows;
DROP TRIGGER IF EXISTS follows_accepted_push ON public.follows;
DROP TRIGGER IF EXISTS follows_new_follower_push ON public.follows;
DROP TRIGGER IF EXISTS posts_friend_post_push ON public.posts;

DROP FUNCTION IF EXISTS public.trg_follow_request_push();
DROP FUNCTION IF EXISTS public.trg_follow_accepted_push();
DROP FUNCTION IF EXISTS public.trg_follow_new_follower_push();
DROP FUNCTION IF EXISTS public.trg_friend_post_push();

-- Drop follow RLS and table usage
DROP POLICY IF EXISTS follows_select ON public.follows;
DROP POLICY IF EXISTS follows_insert ON public.follows;
DROP POLICY IF EXISTS follows_update ON public.follows;
DROP POLICY IF EXISTS follows_delete ON public.follows;

-- Keep table for audit but stop using it in app code
-- DROP TABLE public.follows; -- optional; leave for now

-- ---------------------------------------------------------------------------
-- 1b. Remove privacy / simplify profile + post access
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_private;

CREATE OR REPLACE FUNCTION public.can_view_profile(p_viewer uuid, p_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_viewer IS NOT NULL AND p_target IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.author_completed_today(p_author uuid)
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
    WHERE ue.user_id = p_author
      AND ue.status = 'completed'
      AND de.fires_at >= date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles')
      AND de.fires_at < date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles') + interval '1 day'
  );
$$;

DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
CREATE POLICY profiles_select_authenticated ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS posts_select ON public.posts;
CREATE POLICY posts_select ON public.posts
  FOR SELECT TO authenticated
  USING (
    public.viewer_completed_today(auth.uid())
    AND (
      user_id = auth.uid()
      OR is_community_poll = true
      OR public.author_completed_today(user_id)
    )
  );

CREATE OR REPLACE FUNCTION public.get_friend_ids(p_user uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN f.requester_id = p_user THEN f.addressee_id ELSE f.requester_id END
  FROM public.friendships f
  WHERE f.status = 'accepted'
    AND (f.requester_id = p_user OR f.addressee_id = p_user);
$$;

GRANT EXECUTE ON FUNCTION public.author_completed_today(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_friend_ids(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_profile_by_username(p_username text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_viewer uuid := auth.uid();
  v_row public.profiles%ROWTYPE;
  v_username text := lower(trim(both from coalesce(p_username, '')));
BEGIN
  IF v_viewer IS NULL OR v_username = '' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_row
  FROM public.profiles
  WHERE username = v_username
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

-- ---------------------------------------------------------------------------
-- 1c. Participation: signup-day grace + always fan-out + ensure RPC + buy-in fix
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_events
  ADD COLUMN IF NOT EXISTS signup_day_grace boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.user_end_of_day(p_user_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz text;
BEGIN
  SELECT COALESCE(timezone, 'UTC') INTO v_tz FROM public.profiles WHERE id = p_user_id;
  RETURN (
    (date_trunc('day', timezone(v_tz, now())) + interval '1 day') AT TIME ZONE v_tz
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_profile_fanout_user_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eod timestamptz;
  v_grace boolean;
  v_de record;
BEGIN
  v_eod := public.user_end_of_day(NEW.id);
  v_grace := true;

  FOR v_de IN
    SELECT de.id, de.fires_at, de.window_minutes
    FROM public.daily_events de
    WHERE de.fires_at >= date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles')
      AND de.fires_at < date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles') + interval '1 day'
  LOOP
    INSERT INTO public.user_events (user_id, daily_event_id, status, expires_at, signup_day_grace)
    VALUES (
      NEW.id,
      v_de.id,
      'pending',
      CASE
        WHEN v_grace THEN v_eod
        ELSE v_de.fires_at + (v_de.window_minutes || ' minutes')::interval
      END,
      v_grace
    )
    ON CONFLICT (user_id, daily_event_id) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_today_user_event()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_de record;
  v_eod timestamptz;
  v_grace boolean;
  v_row public.user_events%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_eod := public.user_end_of_day(v_user_id);

  SELECT de.id, de.fires_at, de.window_minutes INTO v_de
  FROM public.daily_events de
  WHERE de.fires_at >= date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles')
    AND de.fires_at < date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles') + interval '1 day'
  ORDER BY de.fires_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT created_at::date = (now() AT TIME ZONE COALESCE(p.timezone, 'UTC'))::date
  INTO v_grace
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF v_grace IS NULL THEN
    v_grace := false;
  END IF;

  INSERT INTO public.user_events (user_id, daily_event_id, status, expires_at, signup_day_grace)
  VALUES (
    v_user_id,
    v_de.id,
    'pending',
    CASE WHEN v_grace THEN v_eod ELSE v_de.fires_at + (v_de.window_minutes || ' minutes')::interval END,
    v_grace
  )
  ON CONFLICT (user_id, daily_event_id) DO NOTHING;

  SELECT ue.* INTO v_row
  FROM public.user_events ue
  WHERE ue.user_id = v_user_id AND ue.daily_event_id = v_de.id
  LIMIT 1;

  RETURN to_jsonb(v_row);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_today_user_event() TO authenticated;

CREATE OR REPLACE FUNCTION public.buy_in_today()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event public.user_events%ROWTYPE;
  v_tz text;
  v_end_of_day timestamptz;
  v_balance integer;
  v_buy_in_cost constant integer := 400;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT ue.* INTO v_event
  FROM public.user_events ue
  JOIN public.daily_events de ON de.id = ue.daily_event_id
  WHERE ue.user_id = v_user_id
    AND ue.buy_in_at IS NULL
    AND (
      ue.status = 'missed'
      OR (ue.status = 'pending' AND ue.expires_at < now() AND NOT COALESCE(ue.signup_day_grace, false))
    )
    AND de.fires_at >= date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles')
    AND de.fires_at < date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles') + interval '1 day'
  ORDER BY de.fires_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_buy_in_available';
  END IF;

  IF v_event.status = 'pending' AND v_event.expires_at < now() THEN
    UPDATE public.user_events SET status = 'missed' WHERE id = v_event.id;
    v_event.status := 'missed';
  END IF;

  v_balance := public.spend_sparks(v_user_id, v_buy_in_cost, 'buy_in', v_event.id::text);

  SELECT COALESCE(timezone, 'UTC') INTO v_tz FROM public.profiles WHERE id = v_user_id;
  v_end_of_day := public.user_end_of_day(v_user_id);

  IF v_event.streak_before_miss IS NOT NULL THEN
    UPDATE public.profiles
    SET current_streak = GREATEST(current_streak, v_event.streak_before_miss)
    WHERE id = v_user_id;
  END IF;

  UPDATE public.user_events
  SET status = 'buy_in_open',
      buy_in_at = now(),
      expires_at = v_end_of_day
  WHERE id = v_event.id;

  RETURN jsonb_build_object(
    'user_event_id', v_event.id,
    'sparks', v_balance,
    'expires_at', v_end_of_day
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 1d. Sparks: extend ledger + idempotent award + participation triggers
-- ---------------------------------------------------------------------------

ALTER TABLE public.spark_ledger DROP CONSTRAINT IF EXISTS spark_ledger_reason_check;
ALTER TABLE public.spark_ledger
  ADD CONSTRAINT spark_ledger_reason_check
  CHECK (reason IN (
    'challenge_complete', 'level_up', 'badge_unlock', 'buy_in', 'purchase', 'welcome_bonus',
    'comment', 'reaction', 'post', 'poll_vote', 'friend_request', 'friend_accept'
  ));

CREATE OR REPLACE FUNCTION public.award_sparks_once(
  p_user_id uuid,
  p_delta integer,
  p_reason text,
  p_ref_id text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
BEGIN
  IF p_delta = 0 OR p_ref_id IS NULL OR btrim(p_ref_id) = '' THEN
    SELECT sparks INTO v_balance FROM public.profiles WHERE id = p_user_id;
    RETURN COALESCE(v_balance, 0);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.spark_ledger sl
    WHERE sl.user_id = p_user_id AND sl.reason = p_reason AND sl.ref_id = p_ref_id
  ) THEN
    SELECT sparks INTO v_balance FROM public.profiles WHERE id = p_user_id;
    RETURN COALESCE(v_balance, 0);
  END IF;

  RETURN public.award_sparks(p_user_id, p_delta, p_reason, p_ref_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sparks_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.award_sparks_once(NEW.user_id, 3, 'comment', 'comment:' || NEW.id::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sparks_comment ON public.comments;
CREATE TRIGGER sparks_comment
  AFTER INSERT ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sparks_comment();

CREATE OR REPLACE FUNCTION public.trg_sparks_reaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.award_sparks_once(NEW.user_id, 2, 'reaction', 'reaction:' || NEW.id::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sparks_reaction ON public.reactions;
CREATE TRIGGER sparks_reaction
  AFTER INSERT ON public.reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sparks_reaction();

CREATE OR REPLACE FUNCTION public.trg_sparks_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND COALESCE(NEW.is_community_poll, false) = false THEN
    PERFORM public.award_sparks_once(NEW.user_id, 10, 'post', 'post:' || NEW.id::text);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sparks_post ON public.posts;
CREATE TRIGGER sparks_post
  AFTER INSERT ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sparks_post();

CREATE OR REPLACE FUNCTION public.trg_sparks_poll_vote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.award_sparks_once(NEW.user_id, 5, 'poll_vote', 'poll_vote:' || NEW.id::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sparks_poll_vote ON public.poll_votes;
CREATE TRIGGER sparks_poll_vote
  AFTER INSERT ON public.poll_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sparks_poll_vote();

CREATE OR REPLACE FUNCTION public.trg_sparks_friend_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    PERFORM public.award_sparks_once(
      NEW.requester_id, 2, 'friend_request', 'friend_request:' || NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sparks_friend_request ON public.friendships;
CREATE TRIGGER sparks_friend_request
  AFTER INSERT ON public.friendships
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sparks_friend_request();

CREATE OR REPLACE FUNCTION public.trg_sparks_friend_accept()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    PERFORM public.award_sparks_once(
      NEW.requester_id, 5, 'friend_accept', 'friend_accept:requester:' || NEW.id::text
    );
    PERFORM public.award_sparks_once(
      NEW.addressee_id, 5, 'friend_accept', 'friend_accept:addressee:' || NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sparks_friend_accept ON public.friendships;
CREATE TRIGGER sparks_friend_accept
  AFTER UPDATE OF status ON public.friendships
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sparks_friend_accept();
