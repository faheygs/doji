-- Award streak shields automatically when a profile's level crosses a milestone.
-- Milestones: 3, 6, 10, 15, 20, 25, 30 … (every 5 from 15 onwards).

CREATE OR REPLACE FUNCTION public.shields_for_level(p_level integer) RETURNS integer AS $$
DECLARE
  milestones integer[] := ARRAY[3, 6, 10, 15, 20, 25, 30, 35, 40, 45, 50];
  m integer;
  count integer := 0;
BEGIN
  FOREACH m IN ARRAY milestones LOOP
    IF p_level >= m THEN count := count + 1; END IF;
  END LOOP;
  RETURN count;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.trg_award_streak_shields() RETURNS trigger AS $$
DECLARE
  old_total integer;
  new_total integer;
  awarded  integer;
BEGIN
  IF NEW.level IS NOT DISTINCT FROM OLD.level THEN
    RETURN NEW;
  END IF;

  old_total := public.shields_for_level(OLD.level);
  new_total := public.shields_for_level(NEW.level);
  awarded   := new_total - old_total;

  IF awarded > 0 THEN
    NEW.streak_shields := COALESCE(NEW.streak_shields, 0) + awarded;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profile_streak_shield_trigger ON public.profiles;
CREATE TRIGGER profile_streak_shield_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_award_streak_shields();
