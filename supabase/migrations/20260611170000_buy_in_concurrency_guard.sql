-- Prevent double-charge on concurrent buy_in_today calls.
-- Two concurrent calls both saw buy_in_at IS NULL before either committed;
-- adding SELECT FOR UPDATE serializes them so the second call sees buy_in_at IS NOT NULL
-- and raises no_buy_in_available. The unique partial index is a belt-and-suspenders
-- backstop in case spend_sparks is ever called outside this function.

CREATE UNIQUE INDEX IF NOT EXISTS spark_ledger_buy_in_once
  ON public.spark_ledger (user_id, ref_id)
  WHERE reason = 'buy_in';

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

  -- SELECT FOR UPDATE serializes concurrent calls on the same row.
  -- The second caller blocks here until the first commits, then sees
  -- buy_in_at IS NOT NULL and falls through to no_buy_in_available.
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
    AND de.fires_at >= now() - interval '36 hours'
  ORDER BY de.fires_at DESC
  LIMIT 1
  FOR UPDATE OF ue;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_buy_in_available';
  END IF;

  -- Normalize status to 'missed' before charging so streak logic is consistent.
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
