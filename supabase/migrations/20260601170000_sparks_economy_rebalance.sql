-- Rebalance Sparks: nothing free in shop, slower earn, expensive buy-in.
-- Price tier: borders < titles < themes; buy-in (not in shop) is most expensive.

-- ---------------------------------------------------------------------------
-- Shop prices (all items cost Sparks)
-- ---------------------------------------------------------------------------
UPDATE public.shop_items SET price = 80 WHERE key = 'border_classic';
UPDATE public.shop_items SET price = 140 WHERE key = 'border_neon';
UPDATE public.shop_items SET price = 220 WHERE key = 'border_gold';
UPDATE public.shop_items SET price = 320 WHERE key = 'border_diamond';

UPDATE public.shop_items SET price = 120 WHERE key = 'title_early_bird';
UPDATE public.shop_items SET price = 240 WHERE key = 'title_streak_master';
UPDATE public.shop_items SET price = 360 WHERE key = 'title_doji_og';

UPDATE public.shop_items SET price = 160 WHERE key = 'doji_orange';
UPDATE public.shop_items SET price = 160 WHERE key = 'neon_blue';
UPDATE public.shop_items SET price = 260 WHERE key = 'forest';
UPDATE public.shop_items SET price = 320 WHERE key = 'orchid';
UPDATE public.shop_items SET price = 420 WHERE key = 'cherry';
UPDATE public.shop_items SET price = 420 WHERE key = 'ocean';
UPDATE public.shop_items SET price = 520 WHERE key = 'sunset';
UPDATE public.shop_items SET price = 680 WHERE key = 'diamond';

ALTER TABLE public.shop_items DROP CONSTRAINT IF EXISTS shop_items_price_positive;
ALTER TABLE public.shop_items
  ADD CONSTRAINT shop_items_price_positive CHECK (price >= 1);

-- ---------------------------------------------------------------------------
-- Slower earn rates
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sparks_for_xp(p_xp integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(1, p_xp / 5);
$$;

CREATE OR REPLACE FUNCTION public.sparks_for_level(p_level integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 5 * GREATEST(p_level, 1);
$$;

CREATE OR REPLACE FUNCTION public.sparks_for_badge_tier(p_tier text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_tier
    WHEN 'bronze' THEN 8
    WHEN 'silver' THEN 15
    WHEN 'gold' THEN 30
    WHEN 'diamond' THEN 60
    ELSE 0
  END;
$$;

-- Welcome bonus only — enough for cheapest shop item (Classic border), no free grants
CREATE OR REPLACE FUNCTION public.trg_profile_welcome_sparks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.award_sparks(NEW.id, 80, 'welcome_bonus', NULL);
  RETURN NEW;
END;
$$;

-- All shop purchases spend Sparks
CREATE OR REPLACE FUNCTION public.purchase_shop_item(p_item_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_item public.shop_items%ROWTYPE;
  v_balance integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_item FROM public.shop_items
  WHERE key = p_item_key AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_not_found';
  END IF;

  IF v_item.price < 1 THEN
    RAISE EXCEPTION 'item_not_for_sale';
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_shop_items WHERE user_id = v_user_id AND item_key = p_item_key) THEN
    RAISE EXCEPTION 'already_owned';
  END IF;

  v_balance := public.spend_sparks(v_user_id, v_item.price, 'purchase', p_item_key);

  INSERT INTO public.user_shop_items (user_id, item_key) VALUES (v_user_id, p_item_key);

  IF v_item.kind = 'theme' THEN
    UPDATE public.profiles SET accent_theme = p_item_key WHERE id = v_user_id;
  ELSIF v_item.kind = 'border' THEN
    UPDATE public.profiles SET equipped_border_key = p_item_key WHERE id = v_user_id;
  ELSIF v_item.kind = 'title' THEN
    UPDATE public.profiles SET equipped_title_key = p_item_key WHERE id = v_user_id;
  END IF;

  RETURN jsonb_build_object('item_key', p_item_key, 'sparks', v_balance);
END;
$$;

-- Buy-in: most expensive spend (not sold in shop)
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
  v_buy_in_cost constant integer := 750;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT ue.* INTO v_event
  FROM public.user_events ue
  JOIN public.daily_events de ON de.id = ue.daily_event_id
  WHERE ue.user_id = v_user_id
    AND ue.status = 'missed'
    AND ue.buy_in_at IS NULL
    AND de.fires_at >= date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles')
    AND de.fires_at < date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles') + interval '1 day'
  ORDER BY de.fires_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_buy_in_available';
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
