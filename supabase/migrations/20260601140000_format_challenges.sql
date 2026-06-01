-- Format challenges: enforced-answer questions (starts_with_letter, exact_word_count)

ALTER TABLE public.challenges DROP CONSTRAINT IF EXISTS challenges_type_check;
ALTER TABLE public.challenges
  ADD CONSTRAINT challenges_type_check CHECK (type IN ('photo', 'poll', 'task', 'format'));

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS answer_rule jsonb;

ALTER TABLE public.challenges DROP CONSTRAINT IF EXISTS challenges_format_requires_rule;
ALTER TABLE public.challenges
  ADD CONSTRAINT challenges_format_requires_rule
  CHECK (type != 'format' OR answer_rule IS NOT NULL);

CREATE OR REPLACE FUNCTION public.validate_format_post_caption()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_type text;
  v_rule jsonb;
  v_answer text;
  v_letter text;
  v_count int;
  v_words int;
BEGIN
  IF NEW.user_event_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.type, c.answer_rule INTO v_type, v_rule
  FROM public.user_events ue
  JOIN public.daily_events de ON de.id = ue.daily_event_id
  JOIN public.challenges c ON c.id = de.challenge_id
  WHERE ue.id = NEW.user_event_id;

  IF v_type IS DISTINCT FROM 'format' OR v_rule IS NULL THEN
    RETURN NEW;
  END IF;

  v_answer := trim(COALESCE(NEW.caption, ''));
  IF v_answer = '' THEN
    RAISE EXCEPTION 'Answer is required for format challenges';
  END IF;

  IF v_rule->>'type' = 'starts_with_letter' THEN
    v_letter := upper(substr(trim(v_rule->>'letter'), 1, 1));
    IF v_letter = '' OR upper(substr(v_answer, 1, 1)) IS DISTINCT FROM v_letter THEN
      RAISE EXCEPTION 'Answer must start with %', v_letter;
    END IF;
  ELSIF v_rule->>'type' = 'exact_word_count' THEN
    v_count := (v_rule->>'count')::int;
    v_words := coalesce(array_length(regexp_split_to_array(v_answer, '\s+'), 1), 0);
    IF v_words IS DISTINCT FROM v_count THEN
      RAISE EXCEPTION 'Answer must be exactly % words', v_count;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_validate_format_caption ON public.posts;
CREATE TRIGGER posts_validate_format_caption
  BEFORE INSERT OR UPDATE OF caption ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_format_post_caption();

INSERT INTO public.challenges (
  title, description, type, category, difficulty, xp_reward,
  requires_photo, requires_video, requires_text, is_active, participant_count,
  answer_rule
) VALUES
(
  'Describe your mood in 3 words',
  'Right now, in this moment — 3 words only.',
  'format', 'mental', 1, 20, false, false, true, true, 0,
  '{"type":"exact_word_count","count":3}'::jsonb
),
(
  'Name something that starts with S',
  'One word or phrase — must start with the letter S.',
  'format', 'creative', 1, 20, false, false, true, true, 0,
  '{"type":"starts_with_letter","letter":"S"}'::jsonb
);
