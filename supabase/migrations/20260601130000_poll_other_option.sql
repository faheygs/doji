-- Poll "Other" option: allow custom free-text answers per voter.

ALTER TABLE public.poll_options
  ADD COLUMN IF NOT EXISTS is_other boolean NOT NULL DEFAULT false;

ALTER TABLE public.poll_votes
  ADD COLUMN IF NOT EXISTS custom_text text;

-- Backfill "Other" option for poll challenges that don't have one yet.
INSERT INTO public.poll_options (challenge_id, text, position, vote_count, is_other)
SELECT c.id, 'Other', 99, 0, true
FROM public.challenges c
WHERE c.type = 'poll'
  AND NOT EXISTS (
    SELECT 1
    FROM public.poll_options po
    WHERE po.challenge_id = c.id
      AND po.is_other = true
  );

-- Custom text required when voting for an "Other" option; forbidden otherwise.
ALTER TABLE public.poll_votes DROP CONSTRAINT IF EXISTS poll_votes_custom_text_check;
ALTER TABLE public.poll_votes
  ADD CONSTRAINT poll_votes_custom_text_check
  CHECK (
    custom_text IS NULL
    OR (
      length(trim(custom_text)) >= 1
      AND length(custom_text) <= 100
    )
  );

CREATE OR REPLACE FUNCTION public.trg_poll_vote_custom_text() RETURNS trigger AS $$
DECLARE
  opt_is_other boolean;
BEGIN
  SELECT is_other INTO opt_is_other
  FROM public.poll_options
  WHERE id = NEW.option_id;

  IF opt_is_other THEN
    IF NEW.custom_text IS NULL OR length(trim(NEW.custom_text)) = 0 THEN
      RAISE EXCEPTION 'custom_text required for Other option';
    END IF;
  ELSE
    IF NEW.custom_text IS NOT NULL THEN
      RAISE EXCEPTION 'custom_text only allowed for Other option';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS poll_vote_custom_text_trigger ON public.poll_votes;
CREATE TRIGGER poll_vote_custom_text_trigger
  BEFORE INSERT OR UPDATE ON public.poll_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_poll_vote_custom_text();
