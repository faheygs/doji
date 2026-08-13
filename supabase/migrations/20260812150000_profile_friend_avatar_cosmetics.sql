-- Profile friend sheets render the same equipped avatar frame used by feeds and profiles.
DROP FUNCTION IF EXISTS public.list_profile_friends(uuid);

CREATE FUNCTION public.list_profile_friends(p_profile_user_id uuid)
RETURNS TABLE (
  friend_id uuid,
  username text,
  display_name text,
  avatar_url text,
  avatar_gradient text[],
  equipped_border_key text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (p.id)
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.avatar_gradient,
    p.equipped_border_key
  FROM public.friendships f
  INNER JOIN public.profiles p
    ON p.id = CASE
      WHEN f.requester_id = p_profile_user_id THEN f.addressee_id
      ELSE f.requester_id
    END
  WHERE f.status = 'accepted'
    AND (f.requester_id = p_profile_user_id OR f.addressee_id = p_profile_user_id)
  ORDER BY p.id, lower(p.display_name), lower(p.username);
$$;

COMMENT ON FUNCTION public.list_profile_friends(uuid) IS
  'Returns visible friend profile summaries including equipped avatar cosmetics.';

GRANT EXECUTE ON FUNCTION public.list_profile_friends(uuid) TO authenticated;
