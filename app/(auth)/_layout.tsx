import React, { useEffect, useMemo } from 'react';
import { Stack, useRouter, type Href } from 'expo-router';
import { useAuthStore } from '../../stores/useAuthStore';
import { useTheme } from '../../contexts/ThemeContext';

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
      router.replace('/(app)/index' as Href);
    } else if (session && !profile) {
      router.replace('/(auth)/username');
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
