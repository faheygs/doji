import React, { useMemo, useState } from 'react';
import { View, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { IconBell } from '@/components/icons/Icons';
import { requestPushPermissionAndRegisterToken } from '@/lib/pushNotifications';
import { useAuthStore } from '@/stores/useAuthStore';
import { safeReplace, ROUTES } from '@/lib/routes';
import { mergeNotificationPreferences } from '@/lib/notificationPreferences';
import { InlineFeedback } from '@/components/ui/InlineFeedback';

export default function OnboardingNotificationsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [setupError, setSetupError] = useState('');
  const updateProfile = useAuthStore((state) => state.updateProfile);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        scroll: {
          flexGrow: 1,
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.xxl,
          paddingBottom: Spacing.lg,
          justifyContent: 'center',
          gap: Spacing.lg,
        },
        iconWrap: {
          width: 88,
          height: 88,
          borderRadius: 24,
          backgroundColor: `${colors.primary}15`,
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: 'center',
        },
        footer: {
          paddingHorizontal: Spacing.lg,
          paddingBottom: Spacing.xxl,
          gap: Spacing.sm,
        },
      }),
    [colors],
  );

  const goNext = async (pushEnabled: boolean) => {
    setSetupError('');
    try {
      const profile = useAuthStore.getState().profile;
      await updateProfile({
        onboarding_completed_at: new Date().toISOString(),
        notification_preferences: {
          ...mergeNotificationPreferences(profile?.notification_preferences),
          push_enabled: pushEnabled,
        },
      });
      safeReplace(router, ROUTES.feed);
    } catch {
      setSetupError('Could not finish setup. Check your connection and try again.');
    }
  };

  const handleEnable = async () => {
    setLoading(true);
    try {
      const result = await requestPushPermissionAndRegisterToken();
      await goNext(result === 'granted');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.iconWrap}>
          <IconBell size={44} color={colors.primary} />
        </View>
        <Text variant="displayMedium" style={{ textAlign: 'center' }}>
          Don't miss the{'\n'}daily Doji
        </Text>
        <Text variant="body" color={colors.textSecondary} style={{ textAlign: 'center', lineHeight: 24 }}>
          Notifications are how you know when the challenge window opens. Tap below and your phone
          will ask you to allow alerts.
        </Text>
      </ScrollView>
      <View style={styles.footer}>
        {setupError ? <InlineFeedback message={setupError} /> : null}
        <Button onPress={() => void handleEnable()} loading={loading} fullWidth size="lg">
          Enable Notifications
        </Button>
        <Button variant="ghost" onPress={() => void goNext(false)} fullWidth size="md" disabled={loading}>
          Skip for now
        </Button>
      </View>
    </SafeAreaView>
  );
}
