import React, { useMemo } from 'react';
import { Stack } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthGate } from '../../hooks/useAuthGate';

export default function AuthLayout() {
  const { colors } = useTheme();
  const { ready, signedIn, hasProfile } = useAuthGate();

  const screenOptions = useMemo(
    () => ({
      headerShown: false as const,
      contentStyle: { backgroundColor: colors.background },
    }),
    [colors.background],
  );

  if (!ready) return null;

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="welcome" />
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !hasProfile}>
        <Stack.Screen name="username" />
      </Stack.Protected>
    </Stack>
  );
}
