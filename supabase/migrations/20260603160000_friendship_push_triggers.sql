-- Restore push triggers for the friendships model.
-- The original follow-based triggers (trg_follow_request_push,
-- trg_follow_accepted_push, trg_friend_post_push) were dropped when the app
-- migrated from follows→friendships, but were never rewritten for the new
-- table. This migration creates them on the correct tables.

-- ---------------------------------------------------------------------------
-- Friend request: notify the addressee when a new pending friendship is sent
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_friendship_request_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO v_name
  FROM public.profiles WHERE id = NEW.requester_id LIMIT 1;

  PERFORM public.doji_notify_user_push(
    NEW.addressee_id,
    'Friend request',
    COALESCE(v_name, 'Someone') || ' wants to be your friend on Doji',
    jsonb_build_object('type', 'FRIEND_REQUEST'),
    'friend_request'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS friendships_request_push ON public.friendships;
CREATE TRIGGER friendships_request_push
  AFTER INSERT ON public.friendships
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.trg_friendship_request_push();

-- ---------------------------------------------------------------------------
-- Friend accepted: notify the requester when their request is accepted
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_friendship_accepted_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  IF OLD.status IS DISTINCT FROM 'pending' OR NEW.status <> 'accepted' THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO v_name
  FROM public.profiles WHERE id = NEW.addressee_id LIMIT 1;

  PERFORM public.doji_notify_user_push(
    NEW.requester_id,
    'Friend request accepted',
    COALESCE(v_name, 'Someone') || ' accepted your friend request',
    jsonb_build_object('type', 'FRIEND_ACCEPTED'),
    'friend_accepted'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS friendships_accepted_push ON public.friendships;
CREATE TRIGGER friendships_accepted_push
  AFTER UPDATE OF status ON public.friendships
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_friendship_accepted_push();

-- ---------------------------------------------------------------------------
-- Friend posted: notify all mutual friends when a user completes the challenge
-- Uses friendships table (requester_id / addressee_id) instead of the
-- dropped follows table.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_friendship_post_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_friend uuid;
  v_name   text;
BEGIN
  IF NEW.is_community_poll THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO v_name
  FROM public.profiles WHERE id = NEW.user_id LIMIT 1;

  -- Fan out to all accepted friends (both directions of the friendship row)
  FOR v_friend IN
    SELECT
      CASE
        WHEN f.requester_id = NEW.user_id THEN f.addressee_id
        ELSE f.requester_id
      END AS friend_id
    FROM public.friendships f
    WHERE (f.requester_id = NEW.user_id OR f.addressee_id = NEW.user_id)
      AND f.status = 'accepted'
  LOOP
    IF v_friend <> NEW.user_id THEN
      PERFORM public.doji_notify_user_push(
        v_friend,
        'Friend posted',
        COALESCE(v_name, 'A friend') || ' completed today''s Doji',
        jsonb_build_object('type', 'FRIEND_POST', 'postId', NEW.id::text, 'url', '/'),
        'friend_post'
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_friendship_post_push ON public.posts;
CREATE TRIGGER posts_friendship_post_push
  AFTER INSERT ON public.posts
  FOR EACH ROW
  WHEN (NEW.is_community_poll IS NOT TRUE)
  EXECUTE FUNCTION public.trg_friendship_post_push();
