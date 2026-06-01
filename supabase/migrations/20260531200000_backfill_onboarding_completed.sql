-- Existing accounts should not see first-run onboarding again.
UPDATE public.profiles
SET onboarding_completed_at = COALESCE(created_at, now())
WHERE onboarding_completed_at IS NULL
  AND (
    total_completions > 0
    OR total_missed > 0
    OR xp > 0
    OR created_at < now() - interval '1 day'
  );
