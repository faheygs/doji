import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Switch,
  TouchableOpacity,
  Platform,
} from 'react-native';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
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

  useEffect(() => {
    setPrefs(mergeNotificationPreferences(profile?.notification_preferences));
  }, [profile?.notification_preferences]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void import('expo-notifications').then((N) => {
      void N.getPermissionsAsync().then(({ status }) => {
        setPermStatus(status === 'granted' ? 'granted' : 'denied');
      });
    });
  }, []);

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

  const persist = useCallback(
    async (next: NotificationPreferences, changedKey: string) => {
      if (!profile?.id) return;
      setSavingKey(changedKey);
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

  const onMasterToggle = useCallback(
    (value: boolean) => {
      Haptics.selectionAsync();
      const next = { ...prefs, push_enabled: value };
      void persist(next, 'push_enabled');
    },
    [persist, prefs],
  );

  const onCategoryToggle = useCallback(
    (key: NotificationPreferenceKind, value: boolean) => {
      Haptics.selectionAsync();
      const next = { ...prefs, [key]: value };
      void persist(next, key);
    },
    [persist, prefs],
  );

  const requestSystemPermission = useCallback(async () => {
    if (Platform.OS === 'web') {
      Toast.show({ type: 'info', text1: 'Notifications are not available on web.' });
      return;
    }
    try {
      const Notifications = await import('expo-notifications');
      const { status } = await Notifications.requestPermissionsAsync();
      setPermStatus(status === 'granted' ? 'granted' : 'denied');
      if (status === 'granted') {
        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        const token = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );
        await updateProfile({ notification_token: token.data });
        Toast.show({ type: 'success', text1: 'Notifications enabled for this device' });
      } else {
        Toast.show({ type: 'error', text1: 'Permission denied — enable in system settings' });
      }
    } catch {
      Toast.show({ type: 'error', text1: 'Could not enable notifications' });
    }
  }, [updateProfile]);

  const categoriesDisabled = !prefs.push_enabled || savingKey === 'push_enabled';

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
              router.navigate('/(app)/settings');
            }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Back to settings"
          >
            <IconChevronLeft size={26} color={colors.text} />
          </TouchableOpacity>
          <Text variant="headingLarge" style={{ flex: 1 }}>
            Notifications
          </Text>
        </View>

        <View style={styles.section}>
          {Platform.OS !== 'web' ? (
            <Card style={{ gap: Spacing.md }}>
              <Text variant="bodySmall" color={colors.textSecondary} style={styles.permissionHint}>
                Allow Doji to show alerts on this device. You can still choose which kinds of updates
                you want below.
              </Text>
              <Text variant="micro" color={colors.textTertiary}>
                System status:{' '}
                {permStatus === 'granted' ? 'Allowed' : permStatus === 'denied' ? 'Not allowed' : '…'}
              </Text>
              {permStatus !== 'granted' ? (
                <TouchableOpacity
                  onPress={requestSystemPermission}
                  style={{
                    paddingVertical: Spacing.sm,
                    paddingHorizontal: Spacing.md,
                    backgroundColor: colors.primary,
                    borderRadius: Radius.md,
                    alignItems: 'center',
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Open system permission for notifications"
                >
                  <Text variant="label" style={{ color: colors.onAccent }}>
                    Allow notifications on this device
                  </Text>
                </TouchableOpacity>
              ) : null}
            </Card>
          ) : (
            <Card>
              <Text variant="bodySmall" color={colors.textSecondary}>
                Use the iOS or Android app to manage push notifications. On web, only in-app alerts
                apply where available.
              </Text>
            </Card>
          )}
        </View>

        <View style={styles.section}>
          <Text variant="headingMedium" style={styles.sectionTitle}>
            In Doji
          </Text>
          <Card style={{ paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm }}>
            <View style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth }]}>
              <View style={styles.rowText}>
                <Text variant="body">All notifications</Text>
                <Text variant="micro" color={colors.textTertiary}>
                  Master switch — turn off to silence every alert below (and remote Doji pushes).
                </Text>
              </View>
              <Switch
                value={prefs.push_enabled}
                onValueChange={onMasterToggle}
                disabled={savingKey === 'push_enabled'}
                trackColor={{ false: colors.surfaceMuted, true: colors.primary }}
                thumbColor={Platform.OS === 'android' ? colors.surface : undefined}
              />
            </View>

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
                  disabled={categoriesDisabled || Boolean(savingKey)}
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
