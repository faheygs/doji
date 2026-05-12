-- ============================================================================
-- Production RLS hardening: remove dev-only INSERT policies that allow any
-- authenticated user to create challenges, daily_events, or poll_options.
-- These tables should only be written to by service_role (Edge Functions).
-- ============================================================================

DROP POLICY IF EXISTS "challenges_insert_auth" ON public.challenges;
DROP POLICY IF EXISTS "daily_events_insert_auth" ON public.daily_events;
DROP POLICY IF EXISTS "poll_options_insert_auth" ON public.poll_options;
