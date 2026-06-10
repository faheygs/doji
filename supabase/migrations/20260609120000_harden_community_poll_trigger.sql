-- Harden community poll post trigger: add ON CONFLICT DO NOTHING and warn on missing challenge.
-- The edge function also creates the post explicitly now, so this trigger is a fallback only.

CREATE OR REPLACE FUNCTION public.trg_daily_event_create_community_poll_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
BEGIN
  SELECT c.type INTO v_type FROM public.challenges c WHERE c.id = NEW.challenge_id;
  IF v_type IS NULL THEN
    RAISE WARNING 'trg_daily_event_create_community_poll_post: challenge % not found for daily_event %', NEW.challenge_id, NEW.id;
    RETURN NEW;
  END IF;
  IF v_type = 'poll' THEN
    INSERT INTO public.posts (
      user_event_id,
      user_id,
      type,
      daily_event_id,
      is_community_poll,
      is_late,
      visibility,
      selected_option_index
    ) VALUES (
      NULL,
      NULL,
      'poll_vote',
      NEW.id,
      true,
      false,
      'public',
      NULL
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
