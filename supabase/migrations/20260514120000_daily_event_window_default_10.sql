-- Align default challenge window with app (10 minutes). Inserts that omit window_minutes use this.
ALTER TABLE public.daily_events
  ALTER COLUMN window_minutes SET DEFAULT 10;
