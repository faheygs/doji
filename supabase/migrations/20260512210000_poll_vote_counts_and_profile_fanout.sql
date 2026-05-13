-- Poll vote trigger: run as definer so RLS does not block updates to poll_options / challenges.
-- Backfill vote_count from poll_votes.
-- New profiles: attach to any daily_event whose submission window is still open.

CREATE OR REPLACE FUNCTION public.trg_poll_vote_insert() RETURNS trigger AS $$
BEGIN
  UPDATE public.poll_options SET vote_count = vote_count + 1 WHERE id = NEW.option_id;
  UPDATE public.challenges SET participant_count = participant_count + 1
    WHERE id = NEW.challenge_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.trg_poll_vote_delete() RETURNS trigger AS $$
BEGIN
  UPDATE public.poll_options
  SET vote_count = GREATEST(0, vote_count - 1)
  WHERE id = OLD.option_id;
  UPDATE public.challenges SET participant_count = GREATEST(0, participant_count - 1)
    WHERE id = OLD.challenge_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS poll_vote_delete_trigger ON public.poll_votes;
CREATE TRIGGER poll_vote_delete_trigger
  AFTER DELETE ON public.poll_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_poll_vote_delete();

UPDATE public.poll_options po
SET vote_count = (
  SELECT count(*)::int FROM public.poll_votes pv WHERE pv.option_id = po.id
);

-- ---------------------------------------------------------------------------
-- New profile → user_events for any daily event whose window is still open
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_profile_fanout_user_events() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_events (user_id, daily_event_id, status, expires_at)
  SELECT
    NEW.id,
    de.id,
    'pending',
    de.fires_at + (de.window_minutes || ' minutes')::interval
  FROM public.daily_events de
  WHERE de.fires_at + (de.window_minutes || ' minutes')::interval > now()
  ON CONFLICT (user_id, daily_event_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS profile_fanout_user_events_trigger ON public.profiles;
CREATE TRIGGER profile_fanout_user_events_trigger
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_profile_fanout_user_events();
