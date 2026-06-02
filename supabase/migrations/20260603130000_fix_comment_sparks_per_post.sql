-- Comment sparks: once per user per post (first comment only; not replies or re-posts).

CREATE OR REPLACE FUNCTION public.trg_sparks_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.award_sparks_once(
    NEW.user_id,
    3,
    'comment',
    'comment:post:' || NEW.post_id::text || ':' || NEW.user_id::text
  );
  RETURN NEW;
END;
$$;
