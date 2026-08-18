-- Apple reviewer test account profile setup.
-- The Auth user is managed separately in environments that need review access.
-- Fresh databases must remain deployable when that optional account is absent.

DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'reviewer@doji.app';

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Optional Apple reviewer Auth user is absent; skipping reviewer profile setup.';
    RETURN;
  END IF;

  INSERT INTO public.profiles (
    id,
    username,
    display_name,
    bio,
    current_streak,
    longest_streak,
    total_completions,
    total_missed,
    xp,
    level,
    reactions_received,
    reactions_given,
    streak_shields,
    sparks,
    accent_theme,
    appearance_mode,
    app_theme,
    timezone,
    is_admin,
    is_demo_account,
    onboarding_completed_at,
    created_at
  )
  VALUES (
    v_user_id,
    'reviewer',
    'App Reviewer',
    null,
    0, 0, 0, 0,
    0, 1,
    0, 0, 0,
    200,
    'default',
    'dark',
    'dark',
    'America/Los_Angeles',
    false,
    true,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    is_demo_account         = true,
    onboarding_completed_at = COALESCE(profiles.onboarding_completed_at, now());
END;
$$;
