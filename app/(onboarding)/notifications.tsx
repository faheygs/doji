import React, { useMemo, useState } from 'react';
import { View, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { IconBell } from '@/components/icons/Icons';
import { requestPushPermissionAndRegisterToken } from '@/lib/pushNotifications';

export default function OnboardingNotificationsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);

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

  const goNext = () => {
    router.replace('/(onboarding)/profile-setup' as Href);
  };

  const handleEnable = async () => {
    setLoading(true);
    try {
      await requestPushPermissionAndRegisterToken();
    } finally {
      setLoading(false);
      goNext();
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
        <Button onPress={() => void handleEnable()} loading={loading} fullWidth size="lg">
          Enable Notifications
        </Button>
        <Button variant="ghost" onPress={goNext} fullWidth size="md" disabled={loading}>
          Skip for now
        </Button>
      </View>
    </SafeAreaView>
  );
}
