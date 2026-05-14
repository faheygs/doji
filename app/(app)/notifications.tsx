import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Switch,
  TouchableOpacity,
  Platform,
  Linking,
} from 'react-native';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';
import { useRouter, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { Spacing, Radius, webScrollParentStyle } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { IconChevronLeft } from '@/components/icons/Icons';
import { useAuthStore } from '@/stores/useAuthStore';
import type { NotificationPreferences } from '@/types/database';
import {
  mergeNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferenceKind,
} from '@/lib/notificationPreferences';

type RowDef = {
  key: NotificationPreferenceKind;
  title: string;
  description: string;
};

const CATEGORY_ROWS: RowDef[] = [
  {
    key: 'doji_start',
    title: 'Doji starting',
    description: "When today's challenge is ready and when your daily Doji push arrives.",
  },
  {
    key: 'friend_post',
    title: 'Friend posts',
    description: 'When someone you are friends with shares to the feed.',
  },
  {
    key: 'reactions_on_my_post',
    title: 'Reactions on my posts',
    description: 'When someone reacts to something you posted.',
  },
  {
    key: 'friend_request',
    title: 'Friend requests',
    description: 'When someone sends you a friend request.',
  },
  {
    key: 'friend_accepted',
    title: 'Friend requests accepted',
    description: 'When someone accepts your friend request.',
  },
  {
    key: 'badges',
    title: 'Badges',
    description: 'When you earn a new badge.',
  },
];

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { profile, updateProfile } = useAuthStore();
  const [prefs, setPrefs] = useState<NotificationPreferences>(() =>
    mergeNotificationPreferences(profile?.notification_preferences ?? DEFAULT_NOTIFICATION_PREFERENCES),
  );
  const [permStatus, setPermStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const refreshPermStatus = useCallback(() => {
    if (Platform.OS === 'web') return;
    void import('expo-notifications').then((N) => {
      void N.getPermissionsAsync().then(({ status }) => {
        setPermStatus(status === 'granted' ? 'granted' : 'denied');
      });
    });
  }, []);

  useEffect(() => {
    setPrefs(mergeNotificationPreferences(profile?.notification_preferences));
  }, [profile?.notification_preferences]);

  useFocusEffect(
    useCallback(() => {
      refreshPermStatus();
    }, [refreshPermStatus]),
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        scrollContent: { paddingBottom: Spacing.xxl },
        header: {
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
        },
        section: {
          paddingHorizontal: Spacing.md,
          marginBottom: Spacing.lg,
          gap: Spacing.sm,
        },
        sectionTitle: {
          paddingHorizontal: Spacing.xs,
          marginBottom: Spacing.xs,
        },
        permissionHint: { marginBottom: Spacing.sm },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.md,
          paddingVertical: Spacing.sm + 2,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.hairline,
        },
        rowLast: {
          borderBottomWidth: 0,
        },
        rowText: { flex: 1, gap: 4 },
      }),
    [colors],
  );

  const persistCategories = useCallback(
    async (patch: Partial<NotificationPreferences>, changedKey: string) => {
      if (!profile?.id) return;
      setSavingKey(changedKey);
      const base = mergeNotificationPreferences(profile.notification_preferences);
      const next: NotificationPreferences = { ...base, ...patch, push_enabled: true };
      try {
        await updateProfile({ notification_preferences: next });
        setPrefs(next);
      } catch {
        Toast.show({ type: 'error', text1: 'Could not save notification settings' });
        setPrefs(mergeNotificationPreferences(profile.notification_preferences));
      } finally {
        setSavingKey(null);
      }
    },
    [profile?.id, profile?.notification_preferences, updateProfile],
  );

  const onCategoryToggle = useCallback(
    (key: NotificationPreferenceKind, value: boolean) => {
      Haptics.selectionAsync();
      void persistCategories({ [key]: value }, key);
    },
    [persistCategories],
  );

  const registerTokenIfGranted = useCallback(async () => {
    const Notifications = await import('expo-notifications');
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    await updateProfile({ notification_token: token.data });
  }, [updateProfile]);

  const enableSystemAlerts = useCallback(async () => {
    if (Platform.OS === 'web') {
      Toast.show({ type: 'info', text1: 'Notifications are not available on web.' });
      return;
    }
    try {
      const Notifications = await import('expo-notifications');
      const { status } = await Notifications.requestPermissionsAsync();
      setPermStatus(status === 'granted' ? 'granted' : 'denied');
      if (status === 'granted') {
        await registerTokenIfGranted();
        Toast.show({ type: 'success', text1: 'Alerts enabled for this device' });
      } else {
        Toast.show({ type: 'error', text1: 'Permission denied — enable in Settings' });
      }
    } catch {
      Toast.show({ type: 'error', text1: 'Could not enable alerts' });
    }
  }, [registerTokenIfGranted]);

  const onMasterSystemSwitch = useCallback(
    async (value: boolean) => {
      Haptics.selectionAsync();
      if (Platform.OS === 'web') {
        Toast.show({ type: 'info', text1: 'Use the mobile app for system alerts.' });
        return;
      }
      if (value) {
        await enableSystemAlerts();
        return;
      }
      try {
        await Linking.openSettings();
        Toast.show({
          type: 'info',
          text1: 'Turn off notifications for Doji in Settings if you want them fully off.',
        });
      } catch {
        Toast.show({ type: 'error', text1: 'Could not open Settings' });
      }
    },
    [enableSystemAlerts],
  );

  const categoriesDisabled =
    Platform.OS === 'web' ? true : permStatus !== 'granted' || Boolean(savingKey);

  return (
    <SafeAreaView style={[styles.container, webScrollParentStyle]}>
      <ScrollView
        style={webScrollParentStyle}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              if (router.canGoBack()) router.back();
              else router.replace('/(app)/settings');
            }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <IconChevronLeft size={26} color={colors.text} />
          </TouchableOpacity>
          <Text variant="headingLarge" style={{ flex: 1 }}>
            Notifications
          </Text>
        </View>

        <View style={styles.section}>
          {Platform.OS !== 'web' ? (
            <Card style={{ paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm }}>
              <View style={[styles.row, styles.rowLast]}>
                <View style={styles.rowText}>
                  <Text variant="body">Alerts on this phone</Text>
                  <Text variant="micro" color={colors.textTertiary}>
                    iOS / Android permission — controls banners, sounds, and lock-screen alerts from
                    Doji.
                  </Text>
                  <Text variant="micro" color={colors.textTertiary}>
                    Status:{' '}
                    {permStatus === 'granted'
                      ? 'Allowed'
                      : permStatus === 'denied'
                        ? 'Not allowed'
                        : '…'}
                  </Text>
                </View>
                <Switch
                  value={permStatus === 'granted'}
                  onValueChange={onMasterSystemSwitch}
                  trackColor={{ false: colors.surfaceMuted, true: colors.primary }}
                  thumbColor={Platform.OS === 'android' ? colors.surface : undefined}
                />
              </View>
              {permStatus !== 'granted' ? (
                <TouchableOpacity
                  onPress={enableSystemAlerts}
                  style={{
                    marginTop: Spacing.sm,
                    paddingVertical: Spacing.sm,
                    paddingHorizontal: Spacing.md,
                    backgroundColor: colors.primary,
                    borderRadius: Radius.md,
                    alignItems: 'center',
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Request notification permission"
                >
                  <Text variant="label" style={{ color: colors.onAccent }}>
                    Request permission
                  </Text>
                </TouchableOpacity>
              ) : null}
            </Card>
          ) : (
            <Card>
              <Text variant="bodySmall" color={colors.textSecondary} style={styles.permissionHint}>
                On web, system push alerts are not available. Use the iOS or Android app for full
                notification settings.
              </Text>
            </Card>
          )}
        </View>

        <View style={styles.section}>
          <Text variant="headingMedium" style={styles.sectionTitle}>
            What we notify you about
          </Text>
          <Text variant="micro" color={colors.textTertiary} style={{ paddingHorizontal: Spacing.xs }}>
            These apply to real device alerts and in-app scheduling when the permission above is on.
          </Text>
          <Card style={{ paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm }}>
            {CATEGORY_ROWS.map((row, i) => (
              <View
                key={row.key}
                style={[styles.row, i === CATEGORY_ROWS.length - 1 ? styles.rowLast : null]}
              >
                <View style={styles.rowText}>
                  <Text
                    variant="body"
                    style={{ color: categoriesDisabled ? colors.textTertiary : colors.text }}
                  >
                    {row.title}
                  </Text>
                  <Text variant="micro" color={colors.textTertiary}>
                    {row.description}
                  </Text>
                </View>
                <Switch
                  value={prefs[row.key]}
                  onValueChange={(v) => onCategoryToggle(row.key, v)}
                  disabled={categoriesDisabled}
                  trackColor={{ false: colors.surfaceMuted, true: colors.primary }}
                  thumbColor={Platform.OS === 'android' ? colors.surface : undefined}
                />
              </View>
            ))}
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}