-- List accepted friends for a profile (SECURITY DEFINER; not readable via direct friendships SELECT for third parties).

CREATE OR REPLACE FUNCTION public.list_profile_friends(p_profile_user_id uuid)
RETURNS TABLE (
  friend_id uuid,
  username text,
  display_name text,
  avatar_url text,
  avatar_gradient text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.avatar_gradient
  FROM public.friendships f
  INNER JOIN public.profiles p
    ON p.id = CASE
      WHEN f.requester_id = p_profile_user_id THEN f.addressee_id
      ELSE f.requester_id
    END
  WHERE f.status = 'accepted'
    AND (f.requester_id = p_profile_user_id OR f.addressee_id = p_profile_user_id)
  ORDER BY lower(p.display_name), lower(p.username);
$$;

COMMENT ON FUNCTION public.list_profile_friends(uuid) IS
  'Public friend list for profile card UIs (accepted only). Callable by authenticated users.';

GRANT EXECUTE ON FUNCTION public.list_profile_friends(uuid) TO authenticated;
