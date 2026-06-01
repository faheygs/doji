-- Resolve member profiles by username for the viewer, including private accounts
-- the viewer cannot fully see (identity + follow CTA, not "user not found").

CREATE OR REPLACE FUNCTION public.get_profile_by_username(p_username text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_viewer uuid := auth.uid();
  v_row public.profiles%ROWTYPE;
  v_username text := lower(trim(both from coalesce(p_username, '')));
BEGIN
  IF v_viewer IS NULL OR v_username = '' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_row
  FROM public.profiles
  WHERE username = v_username
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_viewer = v_row.id OR public.can_view_profile(v_viewer, v_row.id) THEN
    RETURN to_jsonb(v_row);
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'username', v_row.username,
    'display_name', v_row.display_name,
    'avatar_url', v_row.avatar_url,
    'avatar_gradient', v_row.avatar_gradient,
    'bio', NULL,
    'current_streak', 0,
    'longest_streak', 0,
    'total_completions', 0,
    'total_missed', 0,
    'xp', 0,
    'level', COALESCE(v_row.level, 1),
    'reactions_received', 0,
    'streak_shields', 0,
    'notification_token', NULL,
    'app_theme', COALESCE(v_row.app_theme, 'dark'),
    'sparks', 0,
    'accent_theme', COALESCE(v_row.accent_theme, 'doji_orange'),
    'appearance_mode', COALESCE(v_row.appearance_mode, v_row.app_theme, 'dark'),
    'equipped_border_key', v_row.equipped_border_key,
    'equipped_title_key', v_row.equipped_title_key,
    'timezone', COALESCE(v_row.timezone, 'UTC'),
    'is_private', true,
    'is_admin', false,
    'onboarding_completed_at', v_row.onboarding_completed_at,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at
  );
END;
$$;

COMMENT ON FUNCTION public.get_profile_by_username(text) IS
  'Member profile lookup: full row when visible, identity-only stub when private/restricted, NULL if username missing.';

GRANT EXECUTE ON FUNCTION public.get_profile_by_username(text) TO authenticated;
