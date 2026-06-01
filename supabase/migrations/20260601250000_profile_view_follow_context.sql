-- Allow viewing profiles involved in a follow relationship (pending or accepted)
-- so notification bell, follow requests, and follower lists show names/avatars.

CREATE OR REPLACE FUNCTION public.can_view_profile(p_viewer uuid, p_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_viewer = p_target
    OR NOT COALESCE((SELECT is_private FROM public.profiles WHERE id = p_target), false)
    OR public.is_following(p_viewer, p_target)
    OR EXISTS (
      SELECT 1
      FROM public.follows f
      WHERE f.status IN ('accepted', 'pending')
        AND (
          (f.follower_id = p_target AND f.following_id = p_viewer)
          OR (f.follower_id = p_viewer AND f.following_id = p_target)
        )
    );
$$;
