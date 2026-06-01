-- Push triggers for follows, comments, mentions, suggestion review

-- ---------------------------------------------------------------------------
-- Follow request (pending insert on follows)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_follow_request_push()
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

  SELECT display_name INTO v_name FROM public.profiles WHERE id = NEW.follower_id LIMIT 1;

  PERFORM public.doji_notify_user_push(
    NEW.following_id,
    'Follow request',
    COALESCE(v_name, 'Someone') || ' wants to follow you',
    jsonb_build_object('type', 'FOLLOW_REQUEST'),
    'follow_request'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS follows_request_push ON public.follows;
CREATE TRIGGER follows_request_push
  AFTER INSERT ON public.follows
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_follow_request_push();

-- ---------------------------------------------------------------------------
-- Follow accepted
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_follow_accepted_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    SELECT display_name INTO v_name FROM public.profiles WHERE id = NEW.following_id LIMIT 1;

    PERFORM public.doji_notify_user_push(
      NEW.follower_id,
      'Follow accepted',
      COALESCE(v_name, 'Someone') || ' accepted your follow request',
      jsonb_build_object('type', 'FOLLOW_ACCEPTED'),
      'follow_accepted'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS follows_accepted_push ON public.follows;
CREATE TRIGGER follows_accepted_push
  AFTER UPDATE OF status ON public.follows
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_follow_accepted_push();

-- ---------------------------------------------------------------------------
-- Comment on post (notify owner)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_comment_push_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_community boolean;
  v_disabled boolean;
  v_commenter text;
BEGIN
  SELECT p.user_id, COALESCE(p.is_community_poll, false), COALESCE(p.comments_disabled, false)
  INTO v_owner, v_community, v_disabled
  FROM public.posts p
  WHERE p.id = NEW.post_id;

  IF v_community OR v_disabled OR v_owner IS NULL OR v_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO v_commenter FROM public.profiles WHERE id = NEW.user_id LIMIT 1;

  PERFORM public.doji_notify_user_push(
    v_owner,
    'New comment',
    COALESCE(v_commenter, 'Someone') || ' commented on your post',
    jsonb_build_object('type', 'COMMENT', 'postId', NEW.post_id::text),
    'comment'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comments_push_notify ON public.comments;
CREATE TRIGGER comments_push_notify
  AFTER INSERT ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_comment_push_notify();

-- ---------------------------------------------------------------------------
-- @mention in comment
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_comment_mention_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_id uuid;
  v_commenter text;
BEGIN
  SELECT post_id INTO v_post_id FROM public.comments WHERE id = NEW.comment_id LIMIT 1;
  IF v_post_id IS NULL OR NEW.mentioned_user_id = (
    SELECT user_id FROM public.comments WHERE id = NEW.comment_id LIMIT 1
  ) THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO v_commenter
  FROM public.profiles p
  JOIN public.comments c ON c.user_id = p.id
  WHERE c.id = NEW.comment_id
  LIMIT 1;

  PERFORM public.doji_notify_user_push(
    NEW.mentioned_user_id,
    'You were mentioned',
    COALESCE(v_commenter, 'Someone') || ' mentioned you in a comment',
    jsonb_build_object('type', 'MENTION', 'postId', v_post_id::text),
    'mention'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comment_mentions_push ON public.comment_mentions;
CREATE TRIGGER comment_mentions_push
  AFTER INSERT ON public.comment_mentions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_comment_mention_push();

-- ---------------------------------------------------------------------------
-- Suggestion approved / rejected
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_suggestion_review_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'approved' THEN
    PERFORM public.doji_notify_user_push(
      NEW.user_id,
      'Challenge approved!',
      'Your challenge suggestion was approved',
      jsonb_build_object('type', 'SUGGESTION_APPROVED'),
      'suggestion'
    );
  ELSIF OLD.status = 'pending' AND NEW.status = 'rejected' THEN
    PERFORM public.doji_notify_user_push(
      NEW.user_id,
      'Challenge declined',
      'Your challenge suggestion was not selected this time',
      jsonb_build_object('type', 'SUGGESTION_REJECTED'),
      'suggestion'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS suggestion_review_push ON public.challenge_suggestions;
CREATE TRIGGER suggestion_review_push
  AFTER UPDATE OF status ON public.challenge_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_suggestion_review_push();

-- ---------------------------------------------------------------------------
-- Badge tier upgrade push
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_badge_tier_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_cat text;
BEGIN
  IF TG_OP = 'INSERT' OR (OLD.current_tier IS DISTINCT FROM NEW.current_tier) THEN
    SELECT name INTO v_cat FROM public.badge_categories WHERE id = NEW.category_id LIMIT 1;
    PERFORM public.doji_notify_user_push(
      NEW.user_id,
      'Badge unlocked!',
      COALESCE(v_cat, 'Badge') || ' — ' || initcap(NEW.current_tier::text) || ' tier',
      jsonb_build_object('type', 'BADGE_EARNED'),
      'badges'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_badge_progress_push ON public.user_badge_progress;
CREATE TRIGGER user_badge_progress_push
  AFTER INSERT OR UPDATE OF current_tier ON public.user_badge_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_badge_tier_push();

-- Update FRIEND_POST push to use feed url (not post detail)
CREATE OR REPLACE FUNCTION public.trg_friend_post_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_friend uuid;
  v_name text;
BEGIN
  IF NEW.is_community_poll THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO v_name FROM public.profiles WHERE id = NEW.user_id LIMIT 1;

  FOR v_friend IN
    SELECT f.follower_id
    FROM public.follows f
    WHERE f.following_id = NEW.user_id
      AND f.status = 'accepted'
      AND f.follower_id <> NEW.user_id
  LOOP
    PERFORM public.doji_notify_user_push(
      v_friend,
      'Friend posted',
      COALESCE(v_name, 'A friend') || ' completed today''s Doji',
      jsonb_build_object('type', 'FRIEND_POST', 'postId', NEW.id::text, 'url', '/'),
      'friend_post'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_friend_post_push ON public.posts;
CREATE TRIGGER posts_friend_post_push
  AFTER INSERT ON public.posts
  FOR EACH ROW
  WHEN (NEW.is_community_poll IS NOT TRUE)
  EXECUTE FUNCTION public.trg_friend_post_push();
