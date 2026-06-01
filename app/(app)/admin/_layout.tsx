import React, { useMemo } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuthStore } from '../../../stores/useAuthStore';
import { FEED_TAB_HREF } from '../../../lib/navigationReturn';
import { safeReplace } from '../../../lib/routes';

export default function AdminLayout() {
  const { profile, isLoading } = useAuthStore();
  const router = useRouter();
  const { colors } = useTheme();

  const screenOptions = useMemo(
    () => ({
      headerShown: false as const,
      contentStyle: { backgroundColor: colors.background },
    }),
    [colors.background],
  );

  React.useEffect(() => {
    if (isLoading) return;
    if (!profile?.is_admin) {
      safeReplace(router, FEED_TAB_HREF);
    }
  }, [profile?.is_admin, isLoading, router]);

  if (!profile?.is_admin) return null;

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="suggestions" />
    </Stack>
  );
}
