import React, { useMemo } from 'react';
import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDomainRealtime } from '../../hooks/useDomainRealtime';
import { useAuthGate } from '../../hooks/useAuthGate';
import { useTheme } from '../../contexts/ThemeContext';
import { CelebrationHost } from '../../components/gamification/CelebrationHost';
import { webScrollParentStyle } from '../../constants/theme';

export const unstable_settings = { anchor: '(tabs)' };

export default function AppLayout() {
  const session = useAuthStore((state) => state.session);
  const { ready } = useAuthGate();
  const { colors } = useTheme();
  useDomainRealtime(session?.user?.id);

  const screenOptions = useMemo(
    () => ({
      headerShown: false as const,
      contentStyle: [
        { flex: 1, backgroundColor: colors.background },
        webScrollParentStyle,
      ],
    }),
    [colors.background],
  );

  if (!ready) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack screenOptions={screenOptions}>
        <Stack.Screen name="(tabs)" />
      </Stack>
      <CelebrationHost />
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1 } });
