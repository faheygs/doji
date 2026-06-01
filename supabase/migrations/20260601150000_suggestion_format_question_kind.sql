-- Allow format_question in challenge_suggestions.kind (used by suggest-challenge screen).
ALTER TABLE public.challenge_suggestions
  DROP CONSTRAINT IF EXISTS challenge_suggestions_kind_check;

ALTER TABLE public.challenge_suggestions
  ADD CONSTRAINT challenge_suggestions_kind_check
  CHECK (kind IN ('poll', 'wyr', 'question', 'photo_idea', 'format_question'));
