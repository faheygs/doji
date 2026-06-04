-- Push notification to a voter's mutual friends when they vote on a poll.
-- Mirrors the friend_post pattern: fan out to all accepted friends.

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

  -- Fan out to all accepted friends of the voter
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
        'Friend voted',
        COALESCE(v_name, 'A friend') || ' voted on today''s poll',
        jsonb_build_object('type', 'POLL_VOTE', 'url', '/'),
        'poll_vote'
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS poll_votes_friend_push ON public.poll_votes;
CREATE TRIGGER poll_votes_friend_push
  AFTER INSERT ON public.poll_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_poll_vote_friend_push();
