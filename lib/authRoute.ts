import type { Href } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import type { Profile } from '../types/database';
import { needsOnboarding } from './onboardingGate';
import { ROUTES } from './routes';

/** Where the user should go once session + profile are loaded. */
export function resolveAuthenticatedRoute(
  session: Session | null,
  profile: Profile | null,
): Href {
  if (!session) return ROUTES.welcome;
  if (!profile) return ROUTES.username;
  if (needsOnboarding(profile)) return ROUTES.onboardingHowItWorks;
  return ROUTES.feed;
}

export function isAuthRoutingPending(isLoading: boolean, _isProfileLoading: boolean): boolean {
  // isLoading is true only during the one-time startup session check and is
  // set to false permanently once the initial profile fetch completes.
  // isProfileLoading can become true again on any subsequent fetchProfile call
  // (e.g. pull-to-refresh on the profile screen), and including it here caused
  // gate.canUseApp to flip false → Stack.Protected would redirect away from (app).
  return isLoading;
}

export type AuthGate = {
  ready: boolean;
  signedIn: boolean;
  hasProfile: boolean;
  mustFinishOnboarding: boolean;
  canUseApp: boolean;
  /** Signed in but still on welcome/login/username/onboarding screens. */
  canUseAuthGroup: boolean;
};

export function getAuthGate(
  isLoading: boolean,
  isProfileLoading: boolean,
  session: Session | null,
  profile: Profile | null,
): AuthGate {
  const ready = !isAuthRoutingPending(isLoading, isProfileLoading);
  const signedIn = ready && !!session;
  const hasProfile = signedIn && !!profile;
  const mustFinishOnboarding = hasProfile && needsOnboarding(profile);
  const canUseApp = hasProfile && !needsOnboarding(profile);
  const canUseAuthGroup = ready && (!signedIn || !hasProfile);

  return {
    ready,
    signedIn,
    hasProfile,
    mustFinishOnboarding,
    canUseApp,
    canUseAuthGroup,
  };
}
