import React, { useMemo } from 'react';
import { Stack } from 'expo-router';
import { useTheme } from '../../../contexts/ThemeContext';

export default function ProfileLayout() {
  const { colors } = useTheme();

  const screenOptions = useMemo(
    () => ({
      headerShown: false as const,
      contentStyle: { backgroundColor: colors.background },
    }),
    [colors.background],
  );

  return <Stack screenOptions={screenOptions} />;
}
