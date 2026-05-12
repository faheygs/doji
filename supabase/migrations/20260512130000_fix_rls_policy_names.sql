-- ============================================================================
-- Fix RLS: drop stale policies from 002 that the app-store migration tried
-- to replace but missed due to name mismatch. Then recreate with correct names.
--
-- profiles must remain broadly readable (feed avatars, leaderboard, search).
-- daily_events and challenges must remain readable for authenticated users.
-- user_events and streak_events are correctly scoped to own rows already.
-- ============================================================================

-- Drop stale 002 policies (old names the app-store migration failed to remove)
DROP POLICY IF EXISTS "profiles_read_all" ON public.profiles;
DROP POLICY IF EXISTS "daily_events_read_all" ON public.daily_events;
DROP POLICY IF EXISTS "user_events_read_own" ON public.user_events;
DROP POLICY IF EXISTS "streak_events_read_own" ON public.streak_events;
DROP POLICY IF EXISTS "challenges_read_all" ON public.challenges;

-- Drop the overly broad daily_events_select_all added in 20260510 (dev convenience)
DROP POLICY IF EXISTS "daily_events_select_all" ON public.daily_events;

-- Drop the app-store profiles_select_own (too restrictive for feed/leaderboard)
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;

-- Recreate profiles SELECT: authenticated users can read all profiles
-- (needed for feed avatars, friend search, leaderboard, profile viewing)
CREATE POLICY "profiles_select_authenticated" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);
