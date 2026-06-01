-- New accounts start with 200 Sparks (enough to browse shop, not buy everything).

CREATE OR REPLACE FUNCTION public.trg_profile_welcome_sparks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.award_sparks(NEW.id, 200, 'welcome_bonus', NULL);
  RETURN NEW;
END;
$$;
