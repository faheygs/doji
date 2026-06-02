import React, { useMemo } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../stores/useAuthStore';
import { FEED_TAB_HREF } from '../../lib/navigationReturn';
import { needsOnboarding } from '../../lib/onboardingGate';
import { safeReplace, ROUTES } from '../../lib/routes';

export default function OnboardingLayout() {
  const { colors } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const isLoading = useAuthStore((s) => s.isLoading);
  const router = useRouter();

  React.useEffect(() => {
    if (isLoading) return;
    if (!profile) {
      safeReplace(router, ROUTES.welcome);
      return;
    }
    if (!needsOnboarding(profile)) {
      safeReplace(router, FEED_TAB_HREF);
    }
  }, [profile, isLoading, router]);

  const screenOptions = useMemo(
    () => ({
      headerShown: false as const,
      contentStyle: { backgroundColor: colors.background },
      animation: 'fade' as const,
    }),
    [colors.background],
  );

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" />
      <Stack.Screen name="how-it-works" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="profile-setup" />
    </Stack>
  );
}
