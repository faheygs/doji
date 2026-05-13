-- Feed: allow seeing today's schedule and friends' user_event rows needed for post embeds
-- before the viewer has joined. Retention: purge old posts when a new challenge is scheduled
-- or after 24h (RPC for cron).

-- Daily events are not secret; clients need them to resolve "today's" challenge before fan-out.
DROP POLICY IF EXISTS daily_events_select_participant ON public.daily_events;
DROP POLICY IF EXISTS daily_events_select_authenticated ON public.daily_events;
CREATE POLICY daily_events_select_authenticated ON public.daily_events
  FOR SELECT TO authenticated
  USING (true);

-- Allow reading another user's user_event if you can see any post linked to it (RLS on posts applies inside EXISTS).
DROP POLICY IF EXISTS user_events_select_via_post ON public.user_events;
CREATE POLICY user_events_select_via_post ON public.user_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.user_event_id = user_events.id
    )
  );

-- When a new daily_event row is inserted, delete posts tied to older drops (reactions/comments cascade).
CREATE OR REPLACE FUNCTION public.trg_purge_posts_before_new_challenge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.posts p
  USING public.user_events ue
  JOIN public.daily_events de ON de.id = ue.daily_event_id
  WHERE p.user_event_id = ue.id
    AND de.fires_at < NEW.fires_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS daily_event_purge_old_posts ON public.daily_events;
CREATE TRIGGER daily_event_purge_old_posts
  AFTER INSERT ON public.daily_events
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_purge_posts_before_new_challenge();

-- Call from edge / cron if no new daily_event that day; removes posts >24h after their drop.
CREATE OR REPLACE FUNCTION public.purge_posts_older_than_24h()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n int;
BEGIN
  DELETE FROM public.posts p
  USING public.user_events ue
  JOIN public.daily_events de ON de.id = ue.daily_event_id
  WHERE p.user_event_id = ue.id
    AND de.fires_at < now() - interval '24 hours';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_posts_older_than_24h() TO service_role;
