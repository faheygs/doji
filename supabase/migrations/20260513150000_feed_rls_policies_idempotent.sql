-- Idempotent: fixes ERROR 42710 if daily_events_select_authenticated (or user_events_select_via_post)
-- already exists from a partial / manual re-run.

DROP POLICY IF EXISTS daily_events_select_authenticated ON public.daily_events;
CREATE POLICY daily_events_select_authenticated ON public.daily_events
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS user_events_select_via_post ON public.user_events;
CREATE POLICY user_events_select_via_post ON public.user_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.user_event_id = user_events.id
    )
  );
