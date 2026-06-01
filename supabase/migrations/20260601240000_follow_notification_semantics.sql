-- Follow notification semantics: new follower on instant public follow;
-- clear accepted_at on instant follows so bell history stays accurate.

-- Instant public follows should not set accepted_at (only pending→accepted updates do).
UPDATE public.follows
SET accepted_at = NULL
WHERE status = 'accepted'
  AND accepted_at IS NOT NULL
  AND accepted_at <= created_at + interval '1 second';

-- New follower push when someone follows a public account (INSERT accepted).
CREATE OR REPLACE FUNCTION public.trg_follow_new_follower_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  IF NEW.status <> 'accepted' THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO v_name FROM public.profiles WHERE id = NEW.follower_id LIMIT 1;

  PERFORM public.doji_notify_user_push(
    NEW.following_id,
    'New follower',
    COALESCE(v_name, 'Someone') || ' is now following you',
    jsonb_build_object('type', 'FOLLOW_NEW', 'followerId', NEW.follower_id::text),
    'new_follower'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS follows_new_follower_push ON public.follows;
CREATE TRIGGER follows_new_follower_push
  AFTER INSERT ON public.follows
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_follow_new_follower_push();
