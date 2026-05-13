-- ============================================================================
-- FULL PROJECT RESET (destructive)
--
-- Removes ALL end-user data: posts, reactions, friendships, profiles, auth users.
-- KEEPS: public.challenges, public.poll_options (definitions), public.badges (definitions).
--
-- Does NOT clear Storage (avatars/photos). Optional cleanup:
--   DELETE FROM storage.objects WHERE bucket_id IN ('avatars', 'post-media');
--
-- Run in Supabase Dashboard → SQL Editor as a role that can modify auth schema
-- (e.g. postgres), or:
--   npx supabase db query --linked -f supabase/scripts/full_project_reset.sql
--
-- ============================================================================

BEGIN;

-- Feed & social (order respects FKs; community posts included)
DELETE FROM public.reactions;
DELETE FROM public.comments;
DELETE FROM public.posts;

DELETE FROM public.poll_votes;

DELETE FROM public.user_events;

DELETE FROM public.daily_events;

DELETE FROM public.streak_events;
DELETE FROM public.user_badges;
DELETE FROM public.weekly_xp;

DELETE FROM public.friendships;

-- Auth users (ON DELETE CASCADE from auth.users removes matching public.profiles)
DELETE FROM auth.users;

-- Reset challenge counters (definitions kept)
UPDATE public.poll_options SET vote_count = 0;
UPDATE public.challenges SET participant_count = 0 WHERE type = 'poll';

COMMIT;

-- ============================================================================
-- After this, sign-ups create new auth.users + profiles from scratch.
-- Re-run daily scheduling (e.g. schedule-daily-challenge) before testing drops.
-- ============================================================================
