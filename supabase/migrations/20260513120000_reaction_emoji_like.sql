-- Allow thumbs-up "like" reactions alongside existing emoji keys.
ALTER TABLE public.reactions DROP CONSTRAINT IF EXISTS reactions_emoji_check;
ALTER TABLE public.reactions
  ADD CONSTRAINT reactions_emoji_check
  CHECK (emoji IN ('fire', 'laugh', 'wow', 'love', 'like'));
