-- Dedupe friendship rows for the same user pair (can occur after follows → friendships migration).

-- Remove duplicate accepted rows for the same pair (keep lowest id).
DELETE FROM public.friendships f1
USING public.friendships f2
WHERE f1.id > f2.id
  AND f1.status = 'accepted'
  AND f2.status = 'accepted'
  AND (
    (f1.requester_id = f2.requester_id AND f1.addressee_id = f2.addressee_id)
    OR (f1.requester_id = f2.addressee_id AND f1.addressee_id = f2.requester_id)
  );

-- Remove duplicate pending rows for the same directed pair (keep lowest id).
DELETE FROM public.friendships f1
USING public.friendships f2
WHERE f1.id > f2.id
  AND f1.status = 'pending'
  AND f2.status = 'pending'
  AND f1.requester_id = f2.requester_id
  AND f1.addressee_id = f2.addressee_id;

-- If both directions exist as accepted, keep canonical ordering (requester_id < addressee_id).
DELETE FROM public.friendships f1
USING public.friendships f2
WHERE f1.status = 'accepted'
  AND f2.status = 'accepted'
  AND f1.requester_id = f2.addressee_id
  AND f1.addressee_id = f2.requester_id
  AND f1.requester_id > f1.addressee_id;

CREATE OR REPLACE FUNCTION public.friend_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(DISTINCT
    CASE
      WHEN f.requester_id = p_user_id THEN f.addressee_id
      ELSE f.requester_id
    END
  )::integer
  FROM public.friendships f
  WHERE f.status = 'accepted'
    AND (f.requester_id = p_user_id OR f.addressee_id = p_user_id);
$$;

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
  SELECT DISTINCT ON (p.id)
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
  ORDER BY p.id, lower(p.display_name), lower(p.username);
$$;
