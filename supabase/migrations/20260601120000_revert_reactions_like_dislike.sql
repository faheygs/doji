-- Restore classic reaction keys: fire, like, dislike, laugh, wow, heart
ALTER TABLE public.reactions DROP CONSTRAINT IF EXISTS reactions_emoji_check;

UPDATE public.reactions SET emoji = 'dislike' WHERE emoji = 'dead';
UPDATE public.reactions SET emoji = 'like' WHERE emoji = 'goat';

ALTER TABLE public.reactions ADD CONSTRAINT reactions_emoji_check
  CHECK (emoji IN ('fire', 'like', 'dislike', 'laugh', 'wow', 'heart'));
