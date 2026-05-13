-- ============================================================================
-- Clear activity data for a fresh test (keeps: profiles, auth users, friendships,
-- challenges, poll_options, badge definitions).
-- Run: npx supabase db query --linked -f supabase/scripts/clear_activity_for_testing.sql
-- ============================================================================

BEGIN;

DELETE FROM public.reactions;
DELETE FROM public.comments;
DELETE FROM public.posts;
DELETE FROM public.poll_votes;

DELETE FROM public.user_events;
DELETE FROM public.daily_events;

DELETE FROM public.streak_events;
DELETE FROM public.user_badges;
DELETE FROM public.weekly_xp;

-- Counters (safe after bulk deletes; triggers may already have adjusted)
UPDATE public.poll_options SET vote_count = 0;
UPDATE public.challenges SET participant_count = 0 WHERE type = 'poll';

UPDATE public.profiles SET
  xp = 0,
  level = 1,
  current_streak = 0,
  longest_streak = 0,
  total_completions = 0,
  total_missed = 0,
  reactions_received = 0;

COMMIT;
