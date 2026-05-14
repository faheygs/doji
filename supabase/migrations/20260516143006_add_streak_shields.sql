-- Streak shields: protect one missed day per shield, awarded at level milestones.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS streak_shields integer NOT NULL DEFAULT 0;
