-- buy_in_today: also accept status='pending' rows whose window has closed.
-- The expire-events cron flips pending→missed every ~15min, creating a gap where
-- the client shows the buy-in UI but the RPC finds nothing and throws no_buy_in_available.

CREATE OR REPLACE FUNCTION public.buy_in_today()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event public.user_events%ROWTYPE;
  v_tz text;
  v_end_of_day timestamptz;
  v_balance integer;
  v_buy_in_cost constant integer := 400;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT ue.* INTO v_event
  FROM public.user_events ue
  JOIN public.daily_events de ON de.id = ue.daily_event_id
  WHERE ue.user_id = v_user_id
    AND (
      ue.status = 'missed'
      OR (ue.status = 'pending' AND ue.expires_at < now())
    )
    AND ue.buy_in_at IS NULL
    AND ue.signup_day_grace IS NOT TRUE
    AND de.fires_at >= date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles')
    AND de.fires_at < date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles') + interval '1 day'
  ORDER BY de.fires_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_buy_in_available';
  END IF;

  -- Normalize status to 'missed' before charging, so streak logic is consistent.
  IF v_event.status = 'pending' THEN
    UPDATE public.user_events SET status = 'missed' WHERE id = v_event.id;
    v_event.status := 'missed';
  END IF;

  v_balance := public.spend_sparks(v_user_id, v_buy_in_cost, 'buy_in', v_event.id::text);

  SELECT COALESCE(timezone, 'UTC') INTO v_tz FROM public.profiles WHERE id = v_user_id;
  v_end_of_day := (
    (date_trunc('day', timezone(v_tz, now())) + interval '1 day') AT TIME ZONE v_tz
  );

  IF v_event.streak_before_miss IS NOT NULL THEN
    UPDATE public.profiles
    SET current_streak = GREATEST(current_streak, v_event.streak_before_miss)
    WHERE id = v_user_id;
  END IF;

  UPDATE public.user_events
  SET status = 'buy_in_open',
      buy_in_at = now(),
      expires_at = v_end_of_day
  WHERE id = v_event.id;

  RETURN jsonb_build_object(
    'user_event_id', v_event.id,
    'sparks', v_balance,
    'expires_at', v_end_of_day
  );
END;
$$;
