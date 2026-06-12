-- Consolidate friend-activity push triggers.
--
-- Problems fixed:
-- 1. DUPLICATE: posts_friend_push (trg_post_friend_push, from 20260520180000) and
--    posts_friendship_post_push (trg_friendship_post_push, from 20260603160000)
--    both fired AFTER INSERT on posts. Every non-poll post was sending two "friend
--    posted" pushes to every friend. Drop the older one.
--
-- 2. SEPARATE poll_vote category: trg_poll_vote_friend_push used the 'poll_vote'
--    preference key, creating a distinct notification category. From the user's
--    perspective "voted on today's poll" and "completed today's Doji" are the same
--    event. Merge poll votes into the 'friend_post' category so users have a single
--    toggle for "friend activity" regardless of challenge type.

-- ---------------------------------------------------------------------------
-- 1. Drop the duplicate post-push trigger and its function
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS posts_friend_push ON public.posts;
DROP FUNCTION IF EXISTS public.trg_post_friend_push();

-- ---------------------------------------------------------------------------
-- 2. Update poll-vote push: use friend_post preference, consistent message
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_poll_vote_friend_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_friend uuid;
  v_name   text;
BEGIN
  SELECT display_name INTO v_name
  FROM public.profiles WHERE id = NEW.user_id LIMIT 1;

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
        jsonb_build_object('type', 'FRIEND_POST', 'url', '/'),
        'friend_post'
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;
