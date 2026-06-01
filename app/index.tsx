import { Redirect, type Href } from 'expo-router';
import { useAuthStore } from '../stores/useAuthStore';
import { needsOnboarding } from '../lib/onboardingGate';
import { FEED_TAB_HREF, ROUTES } from '../lib/routes';

/**
 * Root entry — always send authenticated users to the real feed href `/(app)`.
 * Never use `/(app)/index` (invalid in Expo Router).
 */
export default function RootIndex() {
  const { session, profile, isLoading } = useAuthStore();

  if (isLoading) {
    return null;
  }

  if (session && profile) {
    if (needsOnboarding(profile)) {
      return <Redirect href={ROUTES.onboarding} />;
    }
    return <Redirect href={FEED_TAB_HREF} />;
  }

  if (session && !profile) {
    return <Redirect href={ROUTES.username} />;
  }

  return <Redirect href={ROUTES.welcome} />;
}
