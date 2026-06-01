-- Sparks economy: currency, shop, buy-in, earn triggers

-- ---------------------------------------------------------------------------
-- Profile cosmetics + balance
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sparks integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accent_theme text NOT NULL DEFAULT 'doji_orange',
  ADD COLUMN IF NOT EXISTS appearance_mode text NOT NULL DEFAULT 'dark',
  ADD COLUMN IF NOT EXISTS equipped_border_key text,
  ADD COLUMN IF NOT EXISTS equipped_title_key text;

COMMENT ON COLUMN public.profiles.sparks IS 'Earn-and-spend meta currency (Sparks).';
COMMENT ON COLUMN public.profiles.accent_theme IS 'Shop accent theme key.';
COMMENT ON COLUMN public.profiles.appearance_mode IS 'light or dark appearance.';

-- Migrate legacy app_theme → appearance_mode
UPDATE public.profiles
SET appearance_mode = CASE
  WHEN app_theme IN ('light', 'coral', 'ocean', 'forest', 'blossom') THEN 'light'
  ELSE 'dark'
END
WHERE appearance_mode = 'dark'
  AND app_theme IS NOT NULL
  AND app_theme NOT IN ('dark', 'midnight', 'aurora');

-- ---------------------------------------------------------------------------
-- user_events: buy-in support
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_events
  ADD COLUMN IF NOT EXISTS buy_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS streak_before_miss integer;

ALTER TABLE public.user_events DROP CONSTRAINT IF EXISTS user_events_status_check;
ALTER TABLE public.user_events
  ADD CONSTRAINT user_events_status_check
  CHECK (status IN ('pending', 'completed', 'missed', 'late', 'buy_in_open'));

-- ---------------------------------------------------------------------------
-- Shop catalog + ownership + ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shop_items (
  key text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('theme', 'border', 'title')),
  name text NOT NULL,
  price integer NOT NULL DEFAULT 0 CHECK (price >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_shop_items (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_key text NOT NULL REFERENCES public.shop_items(key) ON DELETE CASCADE,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_key)
);

CREATE TABLE IF NOT EXISTS public.spark_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  delta integer NOT NULL,
  balance_after integer NOT NULL,
  reason text NOT NULL CHECK (reason IN (
    'challenge_complete', 'level_up', 'badge_unlock', 'buy_in', 'purchase', 'welcome_bonus'
  )),
  ref_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spark_ledger_user_created ON public.spark_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_shop_items_user ON public.user_shop_items(user_id);

ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_shop_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spark_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shop_items_select ON public.shop_items;
CREATE POLICY shop_items_select ON public.shop_items
  FOR SELECT TO authenticated USING (is_active = true);

DROP POLICY IF EXISTS user_shop_items_select ON public.user_shop_items;
CREATE POLICY user_shop_items_select ON public.user_shop_items
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS spark_ledger_select ON public.spark_ledger;
CREATE POLICY spark_ledger_select ON public.spark_ledger
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Seed catalog
INSERT INTO public.shop_items (key, kind, name, price, sort_order, metadata) VALUES
  ('doji_orange', 'theme', 'Doji Orange', 0, 1, '{"color":"#FF6B35"}'),
  ('neon_blue', 'theme', 'Neon Blue', 0, 2, '{"color":"#2196F3"}'),
  ('forest', 'theme', 'Forest', 200, 3, '{"color":"#4CAF50"}'),
  ('orchid', 'theme', 'Orchid', 200, 4, '{"color":"#9C27B0"}'),
  ('cherry', 'theme', 'Cherry', 350, 5, '{"color":"#F44336"}'),
  ('ocean', 'theme', 'Ocean', 350, 6, '{"color":"#00BCD4"}'),
  ('sunset', 'theme', 'Sunset', 500, 7, '{"color":"#FF9800"}'),
  ('diamond', 'theme', 'Diamond', 999, 8, '{"color":"#00D4FF"}'),
  ('border_classic', 'border', 'Classic', 0, 10, '{"color":"#C0C0C0","width":3}'),
  ('border_neon', 'border', 'Neon', 300, 11, '{"color":"#FF6B35","width":3}'),
  ('border_gold', 'border', 'Gold', 500, 12, '{"color":"#FFD700","width":3}'),
  ('border_diamond', 'border', 'Diamond', 999, 13, '{"color":"#00D4FF","width":3}'),
  ('title_early_bird', 'title', 'The Early Bird', 150, 20, '{"label":"The Early Bird"}'),
  ('title_streak_master', 'title', 'Streak Master', 300, 21, '{"label":"Streak Master"}'),
  ('title_doji_og', 'title', 'Doji OG', 0, 22, '{"label":"Doji OG"}')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Spark helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sparks_for_xp(p_xp integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(1, p_xp / 2);
$$;

CREATE OR REPLACE FUNCTION public.sparks_for_level(p_level integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 15 * GREATEST(p_level, 1);
$$;

CREATE OR REPLACE FUNCTION public.sparks_for_badge_tier(p_tier text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_tier
    WHEN 'bronze' THEN 15
    WHEN 'silver' THEN 30
    WHEN 'gold' THEN 60
    WHEN 'diamond' THEN 120
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.award_sparks(
  p_user_id uuid,
  p_delta integer,
  p_reason text,
  p_ref_id text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
BEGIN
  IF p_delta = 0 THEN
    SELECT sparks INTO v_balance FROM public.profiles WHERE id = p_user_id;
    RETURN COALESCE(v_balance, 0);
  END IF;

  UPDATE public.profiles
  SET sparks = GREATEST(0, sparks + p_delta)
  WHERE id = p_user_id
  RETURNING sparks INTO v_balance;

  INSERT INTO public.spark_ledger (user_id, delta, balance_after, reason, ref_id)
  VALUES (p_user_id, p_delta, v_balance, p_reason, p_ref_id);

  RETURN v_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.spend_sparks(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_ref_id text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_spend_amount';
  END IF;

  UPDATE public.profiles
  SET sparks = sparks - p_amount
  WHERE id = p_user_id AND sparks >= p_amount
  RETURNING sparks INTO v_balance;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'insufficient_sparks';
  END IF;

  INSERT INTO public.spark_ledger (user_id, delta, balance_after, reason, ref_id)
  VALUES (p_user_id, -p_amount, v_balance, p_reason, p_ref_id);

  RETURN v_balance;
END;
$$;

-- Welcome bonus + free items on signup
CREATE OR REPLACE FUNCTION public.trg_profile_welcome_sparks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.award_sparks(NEW.id, 25, 'welcome_bonus', NULL);

  INSERT INTO public.user_shop_items (user_id, item_key)
  SELECT NEW.id, k
  FROM unnest(ARRAY['doji_orange', 'neon_blue', 'border_classic', 'title_doji_og']) AS k
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profile_welcome_sparks_trigger ON public.profiles;
CREATE TRIGGER profile_welcome_sparks_trigger
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_profile_welcome_sparks();

-- Level-up sparks (after level recalc)
CREATE OR REPLACE FUNCTION public.trg_profile_level_up_sparks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.level IS NOT NULL AND OLD.level IS NOT NULL AND NEW.level > OLD.level THEN
    PERFORM public.award_sparks(
      NEW.id,
      public.sparks_for_level(NEW.level),
      'level_up',
      NEW.level::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profile_level_up_sparks_trigger ON public.profiles;
CREATE TRIGGER profile_level_up_sparks_trigger
  AFTER UPDATE OF level ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_profile_level_up_sparks();

-- Badge tier unlock sparks
CREATE OR REPLACE FUNCTION public.trg_badge_tier_sparks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount integer;
BEGIN
  IF TG_OP = 'INSERT' OR (NEW.current_tier IS DISTINCT FROM OLD.current_tier) THEN
    v_amount := public.sparks_for_badge_tier(NEW.current_tier);
    IF v_amount > 0 THEN
      PERFORM public.award_sparks(
        NEW.user_id,
        v_amount,
        'badge_unlock',
        NEW.category_id || ':' || NEW.current_tier
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS badge_tier_sparks_trigger ON public.user_badge_progress;
CREATE TRIGGER badge_tier_sparks_trigger
  AFTER INSERT OR UPDATE OF current_tier ON public.user_badge_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_badge_tier_sparks();

-- ---------------------------------------------------------------------------
-- Challenge complete: award sparks (+ support buy_in_open → completed)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_user_event_complete() RETURNS trigger AS $$
DECLARE
  v_xp_reward integer;
  v_challenge_id uuid;
  v_week date;
  v_new_xp integer;
  v_new_level integer;
  v_streak integer;
  v_completions integer;
  v_poll_count bigint;
  v_recv integer;
  v_friends_count bigint;
  v_last_completed date;
  v_today date;
  user_tz text;
  v_sparks integer;
  v_spark_mult numeric;
BEGIN
  IF (NEW.status IN ('completed', 'late')) AND (OLD.status IN ('pending', 'buy_in_open')) THEN
    SELECT c.xp_reward, de.challenge_id INTO v_xp_reward, v_challenge_id
      FROM public.daily_events de
      JOIN public.challenges c ON c.id = de.challenge_id
      WHERE de.id = NEW.daily_event_id;

    IF v_xp_reward IS NULL THEN v_xp_reward := 25; END IF;

    SELECT COALESCE(timezone, 'UTC') INTO user_tz FROM public.profiles WHERE id = NEW.user_id;
    v_today := (timezone(user_tz, COALESCE(NEW.completed_at, now())))::date;

    SELECT MAX((timezone(user_tz, ue.completed_at))::date) INTO v_last_completed
      FROM public.user_events ue
      WHERE ue.user_id = NEW.user_id
        AND ue.status IN ('completed', 'late')
        AND ue.id != NEW.id;

    IF v_last_completed = v_today - interval '1 day' THEN
      UPDATE public.profiles
        SET xp = xp + v_xp_reward,
            total_completions = total_completions + 1,
            current_streak = current_streak + 1,
            longest_streak = GREATEST(longest_streak, current_streak + 1)
        WHERE id = NEW.user_id
        RETURNING xp, level, current_streak, total_completions, reactions_received
          INTO v_new_xp, v_new_level, v_streak, v_completions, v_recv;
    ELSIF v_last_completed = v_today THEN
      UPDATE public.profiles
        SET xp = xp + v_xp_reward,
            total_completions = total_completions + 1
        WHERE id = NEW.user_id
        RETURNING xp, level, current_streak, total_completions, reactions_received
          INTO v_new_xp, v_new_level, v_streak, v_completions, v_recv;
    ELSE
      UPDATE public.profiles
        SET xp = xp + v_xp_reward,
            total_completions = total_completions + 1,
            current_streak = 1,
            longest_streak = GREATEST(longest_streak, 1)
        WHERE id = NEW.user_id
        RETURNING xp, level, current_streak, total_completions, reactions_received
          INTO v_new_xp, v_new_level, v_streak, v_completions, v_recv;
    END IF;

    v_week := date_trunc('week', now())::date;
    INSERT INTO public.weekly_xp (user_id, week_start, xp)
      VALUES (NEW.user_id, v_week, v_xp_reward)
      ON CONFLICT (user_id, week_start)
      DO UPDATE SET xp = public.weekly_xp.xp + v_xp_reward;

    v_spark_mult := CASE WHEN OLD.status = 'buy_in_open' OR NEW.buy_in_at IS NOT NULL THEN 0.5 ELSE 1.0 END;
    v_sparks := GREATEST(1, (public.sparks_for_xp(v_xp_reward) * v_spark_mult)::integer);
    PERFORM public.award_sparks(NEW.user_id, v_sparks, 'challenge_complete', NEW.id::text);

    IF v_streak >= 3 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'streak_3') ON CONFLICT DO NOTHING;
    END IF;
    IF v_streak >= 7 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'on_fire') ON CONFLICT DO NOTHING;
    END IF;
    IF v_streak >= 14 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'streak_14') ON CONFLICT DO NOTHING;
    END IF;
    IF v_streak >= 30 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'streak_30') ON CONFLICT DO NOTHING;
    END IF;
    IF v_streak >= 100 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'streak_100') ON CONFLICT DO NOTHING;
    END IF;

    IF v_completions >= 1 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'first_one') ON CONFLICT DO NOTHING;
    END IF;
    IF v_completions >= 10 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'ten_done') ON CONFLICT DO NOTHING;
    END IF;
    IF v_completions >= 50 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'fifty_done') ON CONFLICT DO NOTHING;
    END IF;
    IF v_completions >= 100 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'century') ON CONFLICT DO NOTHING;
    END IF;
    IF v_completions >= 250 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'two_fifty') ON CONFLICT DO NOTHING;
    END IF;
    IF v_completions >= 500 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'five_hundred') ON CONFLICT DO NOTHING;
    END IF;

    IF v_new_xp >= 1000 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'xp_1000') ON CONFLICT DO NOTHING;
    END IF;
    IF v_new_xp >= 5000 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'xp_5000') ON CONFLICT DO NOTHING;
    END IF;
    IF v_new_xp >= 10000 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'xp_10000') ON CONFLICT DO NOTHING;
    END IF;

    IF v_recv >= 100 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'beloved_100') ON CONFLICT DO NOTHING;
    END IF;
    IF v_recv >= 500 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'beloved_500') ON CONFLICT DO NOTHING;
    END IF;
    IF v_recv >= 1000 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'beloved') ON CONFLICT DO NOTHING;
    END IF;

    SELECT count(*) INTO v_poll_count FROM public.poll_votes WHERE user_id = NEW.user_id;
    IF v_poll_count >= 10 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'poll_10') ON CONFLICT DO NOTHING;
    END IF;
    IF v_poll_count >= 50 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'poll_star') ON CONFLICT DO NOTHING;
    END IF;
    IF v_poll_count >= 100 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'poll_100') ON CONFLICT DO NOTHING;
    END IF;

    IF v_new_level >= 5 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'level_5') ON CONFLICT DO NOTHING;
    END IF;
    IF v_new_level >= 10 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'level_10') ON CONFLICT DO NOTHING;
    END IF;

    SELECT count(*) INTO v_friends_count
      FROM public.friendships
      WHERE status = 'accepted'
        AND (requester_id = NEW.user_id OR addressee_id = NEW.user_id);
    IF v_friends_count >= 1 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'social_1') ON CONFLICT DO NOTHING;
    END IF;
    IF v_friends_count >= 10 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'social_10') ON CONFLICT DO NOTHING;
    END IF;
    IF v_friends_count >= 50 THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, 'social_50') ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Tiered badges: also fire on buy_in_open → completed
CREATE OR REPLACE FUNCTION public.trg_award_tiered_badges() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IN ('pending', 'buy_in_open') THEN
    PERFORM public.award_tiered_badges_for_user(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Shop RPCs
-- ---------------------------------------------------------------------------
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

  IF EXISTS (SELECT 1 FROM public.user_shop_items WHERE user_id = v_user_id AND item_key = p_item_key) THEN
    RAISE EXCEPTION 'already_owned';
  END IF;

  IF v_item.price > 0 THEN
    v_balance := public.spend_sparks(v_user_id, v_item.price, 'purchase', p_item_key);
  ELSE
    SELECT sparks INTO v_balance FROM public.profiles WHERE id = v_user_id;
  END IF;

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

CREATE OR REPLACE FUNCTION public.equip_shop_item(p_item_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_item public.shop_items%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_shop_items WHERE user_id = v_user_id AND item_key = p_item_key
  ) THEN
    RAISE EXCEPTION 'not_owned';
  END IF;

  SELECT * INTO v_item FROM public.shop_items WHERE key = p_item_key AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_not_found';
  END IF;

  IF v_item.kind = 'theme' THEN
    UPDATE public.profiles SET accent_theme = p_item_key WHERE id = v_user_id;
  ELSIF v_item.kind = 'border' THEN
    UPDATE public.profiles SET equipped_border_key = p_item_key WHERE id = v_user_id;
  ELSIF v_item.kind = 'title' THEN
    UPDATE public.profiles SET equipped_title_key = p_item_key WHERE id = v_user_id;
  ELSE
    RAISE EXCEPTION 'not_equippable';
  END IF;

  RETURN jsonb_build_object('item_key', p_item_key);
END;
$$;

-- Buy-in: reopen missed today + restore streak
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
  v_buy_in_cost constant integer := 50;
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

GRANT EXECUTE ON FUNCTION public.purchase_shop_item(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.equip_shop_item(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buy_in_today() TO authenticated;

-- Backfill free shop items for existing users
INSERT INTO public.user_shop_items (user_id, item_key)
SELECT p.id, k
FROM public.profiles p
CROSS JOIN unnest(ARRAY['doji_orange', 'neon_blue', 'border_classic', 'title_doji_og']) AS k
ON CONFLICT DO NOTHING;

-- Realtime for sparks balance
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_shop_items;
