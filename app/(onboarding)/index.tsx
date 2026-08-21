import { Redirect } from 'expo-router';
import { ROUTES } from '@/lib/routes';

/** The onboarding group always enters through the current How it works screen. */
export default function OnboardingIndexRedirect() {
  return <Redirect href={ROUTES.onboardingHowItWorks} />;
}
