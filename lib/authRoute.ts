import type { Href } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import type { Profile } from '../types/database';
import { needsOnboarding } from './onboardingGate';
import { ROUTES } from './routes';
import { isEmployeeSession } from './employeeIdentity';

/** Where the user should go once session + profile are loaded. */
export function resolveAuthenticatedRoute(
  session: Session | null,
  profile: Profile | null,
): Href {
  if (!session || isEmployeeSession(session)) return ROUTES.welcome;
  if (!profile) return ROUTES.username;
  if (profile.is_banned) return ROUTES.banned;
  if (needsOnboarding(profile)) return ROUTES.onboardingHowItWorks;
  return ROUTES.feed;
}

export function isAuthRoutingPending(
  isLoading: boolean,
  isProfileLoading: boolean,
  session: Session | null,
  profile: Profile | null,
  profileLoadState: 'idle' | 'loading' | 'ready' | 'missing' | 'error' = 'idle',
): boolean {
  // A persisted profile is presentation cache, not authorization truth. Wait
  // for the first owner-profile read of this session even when cached data is
  // available, so a newly banned account cannot enter the protected app.
  return isLoading || (
    !!session && !isEmployeeSession(session) &&
    (isProfileLoading || profileLoadState === 'idle' || profileLoadState === 'loading')
  );
}

export type AuthGate = {
  isEmployee: boolean;
  ready: boolean;
  signedIn: boolean;
  hasProfile: boolean;
  mustFinishOnboarding: boolean;
  isBanned: boolean;
  canUseBannedScreen: boolean;
  canUseApp: boolean;
  /** Signed in but still on welcome/login/username/onboarding screens. */
  canUseAuthGroup: boolean;
  profileLoadFailed: boolean;
};

export function getAuthGate(
  isLoading: boolean,
  isProfileLoading: boolean,
  session: Session | null,
  profile: Profile | null,
  profileLoadState: 'idle' | 'loading' | 'ready' | 'missing' | 'error' = 'idle',
): AuthGate {
  const isEmployee = isEmployeeSession(session);
  const profileLoadFailed = !!session && !isEmployee && profileLoadState === 'error';
  const ready = !profileLoadFailed && !isAuthRoutingPending(
    isLoading,
    isProfileLoading,
    session,
    profile,
    profileLoadState,
  );
  const signedIn = ready && !!session;
  const hasProfile = signedIn && !isEmployee && !!profile;
  const isBanned = hasProfile && profile.is_banned === true;
  const mustFinishOnboarding = hasProfile && !isBanned && needsOnboarding(profile);
  const canUseApp = hasProfile && !isBanned && !needsOnboarding(profile);
  const canUseBannedScreen = isBanned;
  const canUseAuthGroup = ready && !isEmployee && (!signedIn || !hasProfile);

  return {
    isEmployee,
    ready,
    signedIn,
    hasProfile,
    isBanned,
    canUseBannedScreen,
    mustFinishOnboarding,
    canUseApp,
    canUseAuthGroup,
    profileLoadFailed,
  };
}
