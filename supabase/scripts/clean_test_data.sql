-- ============================================================================
-- Clean all test data for go-live
-- Run this in Supabase SQL Editor ONCE before launch
-- This preserves the schema, badge definitions, and user accounts
-- but wipes all activity data
-- ============================================================================

BEGIN;

-- 1. Wipe all reactions
DELETE FROM public.reactions;

-- 2. Wipe all posts
DELETE FROM public.posts;

-- 3. Wipe all poll votes
DELETE FROM public.poll_votes;

-- 4. Wipe all user events
DELETE FROM public.user_events;

-- 5. Wipe all daily events
DELETE FROM public.daily_events;

-- 6. Wipe all streak events
DELETE FROM public.streak_events;

-- 7. Wipe all earned badges (keeps badge definitions)
DELETE FROM public.user_badges;

-- 8. Wipe all weekly XP
DELETE FROM public.weekly_xp;

-- 9. Wipe all test challenges (you'll seed real ones before launch)
DELETE FROM public.poll_options;
DELETE FROM public.challenges;

-- 10. Reset all profile stats to zero
UPDATE public.profiles SET
  xp = 0,
  level = 1,
  current_streak = 0,
  longest_streak = 0,
  total_completions = 0,
  total_missed = 0,
  reactions_received = 0;

COMMIT;
