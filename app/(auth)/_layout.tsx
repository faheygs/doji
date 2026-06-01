import React, { useEffect, useMemo } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useAuthStore } from '../../stores/useAuthStore';
import { useTheme } from '../../contexts/ThemeContext';
import { FEED_TAB_HREF } from '../../lib/navigationReturn';
import { safeReplace } from '../../lib/routes';
import { needsOnboarding } from '../../lib/onboardingGate';

export default function AuthLayout() {
  const { session, profile, isLoading } = useAuthStore();
  const router = useRouter();
  const { colors } = useTheme();

  const screenOptions = useMemo(
    () => ({
      headerShown: false as const,
      contentStyle: { backgroundColor: colors.background },
    }),
    [colors.background],
  );

  useEffect(() => {
    if (isLoading) return;

    if (session && profile) {
      if (needsOnboarding(profile)) {
        safeReplace(router, '/(onboarding)');
      } else {
        safeReplace(router, FEED_TAB_HREF);
      }
    } else if (session && !profile) {
      safeReplace(router, '/(auth)/username');
    }
  }, [session, profile, isLoading]);

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="login" />
      <Stack.Screen name="username" />
    </Stack>
  );
}
