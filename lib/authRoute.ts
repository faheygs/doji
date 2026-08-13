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

export function isAuthRoutingPending(
  isLoading: boolean,
  isProfileLoading: boolean,
  session: Session | null,
  profile: Profile | null,
): boolean {
  // Wait for the first owner-profile read after sign-in so an existing account
  // cannot be mistaken for a new account. Once a profile exists, later refreshes
  // keep the protected app group mounted.
  return isLoading || (!!session && !profile && isProfileLoading);
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
  const ready = !isAuthRoutingPending(isLoading, isProfileLoading, session, profile);
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
