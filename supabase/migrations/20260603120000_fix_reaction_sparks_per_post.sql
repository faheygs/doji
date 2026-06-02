-- Reaction sparks: once per user per post (not per reaction row).
-- Profile stat: accurate reactions-given count without RLS under-counting.

CREATE OR REPLACE FUNCTION public.trg_sparks_reaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.award_sparks_once(
    NEW.user_id,
    2,
    'reaction',
    'reaction:post:' || NEW.post_id::text || ':' || NEW.user_id::text
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_reactions_given_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer FROM public.reactions WHERE user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_reactions_given_count(uuid) TO authenticated;
