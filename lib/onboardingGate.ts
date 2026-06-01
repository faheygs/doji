import type { Profile } from '../types/database';

/** True when a brand-new account must finish first-run onboarding. */
export function needsOnboarding(profile: Profile | null | undefined): boolean {
  if (!profile) return false;
  if (profile.onboarding_completed_at != null) return false;

  // Returning users who signed up before onboarding shipped: they have activity or an older profile.
  if (profile.total_completions > 0 || profile.total_missed > 0 || profile.xp > 0) {
    return false;
  }

  const accountAgeMs = Date.now() - new Date(profile.created_at).getTime();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  if (accountAgeMs > ONE_DAY_MS) return false;

  return true;
}

/** Mark onboarding complete for returning users (e.g. after sign-in). */
export function shouldAutoCompleteOnboarding(profile: Profile): boolean {
  if (profile.onboarding_completed_at != null) return false;
  return !needsOnboarding(profile);
}
