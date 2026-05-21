-- Friend count visible on profiles without SELECT on other users' friendship rows (RLS is party-only).

CREATE OR REPLACE FUNCTION public.friend_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (count(*)::integer)
  FROM public.friendships
  WHERE status = 'accepted'::text
    AND (requester_id = p_user_id OR addressee_id = p_user_id);
$$;

COMMENT ON FUNCTION public.friend_count(uuid) IS
  'Accepted friendship count for p_user_id; callable by authenticated users.';

GRANT EXECUTE ON FUNCTION public.friend_count(uuid) TO authenticated;
