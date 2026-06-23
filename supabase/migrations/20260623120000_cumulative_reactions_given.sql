-- Track reactions_given cumulatively on the profile.
-- Unlike reactions_received (which mirrors the live reaction count),
-- reactions_given only ever increases — post purges don't erase your history.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS reactions_given integer NOT NULL DEFAULT 0;

-- Increment on insert, never decrement.
CREATE OR REPLACE FUNCTION public.trg_reactions_given_inc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET reactions_given = reactions_given + 1 WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reactions_given_inc ON public.reactions;
CREATE TRIGGER trg_reactions_given_inc
  AFTER INSERT ON public.reactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_reactions_given_inc();

-- Backfill: count distinct live reactions per user as a floor.
-- (Historical reactions already purged are lost, but this sets the minimum.)
UPDATE public.profiles p
SET reactions_given = sub.cnt
FROM (
  SELECT user_id, COUNT(*)::integer AS cnt
  FROM public.reactions
  GROUP BY user_id
) sub
WHERE p.id = sub.user_id
  AND sub.cnt > p.reactions_given;

-- Replace the RPC to read from the profile column so it stays accurate
-- even after post purges.
CREATE OR REPLACE FUNCTION public.get_reactions_given_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(reactions_given, 0) FROM public.profiles WHERE id = p_user_id;
$$;
