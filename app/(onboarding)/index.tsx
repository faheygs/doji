import { Redirect } from 'expo-router';
import { ROUTES } from '@/lib/routes';

/** Skip the legacy splash — new users go straight to How it works. */
export default function OnboardingIndexRedirect() {
  return <Redirect href={ROUTES.onboardingHowItWorks} />;
}
