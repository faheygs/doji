import React, { useMemo } from 'react';
import { Stack } from 'expo-router';
import { useTheme } from '../../../contexts/ThemeContext';

/** Stack for viewing *other* users — separate from the Profile tab so Back returns to Friends/Feed/etc. */
export default function MemberLayout() {
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
