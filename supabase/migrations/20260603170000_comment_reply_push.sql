-- Push notification when someone replies to your comment.

CREATE OR REPLACE FUNCTION public.trg_comment_reply_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_author uuid;
  v_replier_name  text;
  v_post_id       uuid;
BEGIN
  -- Only fire for replies, not top-level comments
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get author and post of the parent comment
  SELECT user_id, post_id INTO v_parent_author, v_post_id
  FROM public.comments
  WHERE id = NEW.parent_id
  LIMIT 1;

  -- Don't notify when replying to your own comment
  IF v_parent_author IS NULL OR v_parent_author = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO v_replier_name
  FROM public.profiles WHERE id = NEW.user_id LIMIT 1;

  PERFORM public.doji_notify_user_push(
    v_parent_author,
    'New reply',
    COALESCE(v_replier_name, 'Someone') || ' replied to your comment',
    jsonb_build_object('type', 'COMMENT_REPLY', 'postId', v_post_id::text),
    'comment_reply'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comments_reply_push ON public.comments;
CREATE TRIGGER comments_reply_push
  AFTER INSERT ON public.comments
  FOR EACH ROW
  WHEN (NEW.parent_id IS NOT NULL)
  EXECUTE FUNCTION public.trg_comment_reply_push();
