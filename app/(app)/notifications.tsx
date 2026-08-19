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
import { useRouter, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { Spacing, webScrollParentStyle } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useAppDialog } from '@/contexts/DialogContext';
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
import { goBackToExplicitReturn } from '@/lib/navigationReturn';
import { supabase } from '@/lib/supabase';
import {
  syncPushRegistration,
  unregisterCurrentPushInstallation,
} from '@/lib/pushNotifications';

type RowDef = {
  key: NotificationPreferenceKind;
  title: string;
  description: string;
};

const CATEGORY_ROWS: RowDef[] = [
  {
    key: 'doji_start',
    title: 'Daily Challenge Alert',
    description: "When today's Doji goes live.",
  },
  {
    key: 'friend_post',
    title: 'Friend activity',
    description: "Grouped updates when friends complete today's Doji.",
  },
  {
    key: 'reactions_on_my_post',
    title: 'Reactions & comment likes',
    description: 'Grouped updates for reactions and likes.',
  },
  {
    key: 'comment',
    title: 'New Comment',
    description: 'When someone comments on your post.',
  },
  {
    key: 'mention',
    title: 'Mentions',
    description: 'When someone @mentions you in a comment.',
  },
  {
    key: 'friend_request',
    title: 'Friend Requests',
    description: 'When someone sends you a friend request.',
  },
  {
    key: 'friend_accepted',
    title: 'Friend Accepted',
    description: 'When someone accepts your friend request.',
  },
  {
    key: 'badges',
    title: 'Badge Unlocked',
    description: 'When you earn or upgrade a badge.',
  },
  {
    key: 'suggestion',
    title: 'Challenge Review',
    description: 'When your submission is approved or declined.',
  },
];

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { colors } = useTheme();
  const { showDialog } = useAppDialog();
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

  /** Track + knob colors — match primary `<Button>` (accent fill + onAccent), not `primary` token. */
  const themedSwitchProps = useCallback(
    (value: boolean, opts?: { disabled?: boolean }) => {
      const disabled = opts?.disabled ?? false;
      const inactiveTrack = disabled ? colors.hairline : colors.surfaceMuted;
      const activeTrack = disabled ? colors.fillMuted : colors.primary;
      const thumbOn = colors.onPrimary;
      const thumbOff = Platform.OS === 'ios' ? colors.surface : colors.surfaceElevated ?? colors.surface;

      return {
        trackColor: {
          false: inactiveTrack,
          true: activeTrack,
        },
        ios_backgroundColor: inactiveTrack,
        thumbColor:
          Platform.OS === 'web'
            ? undefined
            : Platform.OS === 'ios'
              ? value
                ? thumbOn
                : thumbOff
              : value
                ? thumbOn
                : thumbOff,
      };
    },
    [colors],
  );

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
      const next: NotificationPreferences = { ...base, ...patch };
      setPrefs(next);
      try {
        await updateProfile({ notification_preferences: next });
        return true;
      } catch {
        Toast.show({ type: 'error', text1: 'Could not save notification settings' });
        setPrefs(mergeNotificationPreferences(profile.notification_preferences));
        return false;
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
    await syncPushRegistration(profile?.id);
  }, [profile?.id]);

  const enableSystemAlerts = useCallback(async () => {
    if (Platform.OS === 'web') {
      Toast.show({ type: 'info', text1: 'Notifications are not available on web.' });
      return;
    }
    try {
      const Notifications = await import('expo-notifications');
      const currentPermission = await Notifications.getPermissionsAsync();
      const { status } =
        currentPermission.status === 'granted'
          ? currentPermission
          : await Notifications.requestPermissionsAsync();
      setPermStatus(status === 'granted' ? 'granted' : 'denied');
      if (status === 'granted') {
        await registerTokenIfGranted();
        const saved = await persistCategories({ push_enabled: true }, 'push_enabled');
        if (!saved) return;
        Toast.show({ type: 'success', text1: 'Alerts enabled for this device' });
      } else {
        setPrefs(mergeNotificationPreferences(useAuthStore.getState().profile?.notification_preferences));
        showDialog({
          title: 'Allow notifications',
          message: 'Turn on notifications for Doji in your phone settings.',
          actions: [
            { label: 'Not now', variant: 'cancel' },
            { label: 'Open Settings', onPress: () => Linking.openSettings() },
          ],
        });
      }
    } catch {
      setPrefs(mergeNotificationPreferences(useAuthStore.getState().profile?.notification_preferences));
      Toast.show({ type: 'error', text1: 'Could not enable alerts' });
    }
  }, [persistCategories, registerTokenIfGranted, showDialog]);

  const disableSystemAlerts = useCallback(async () => {
    const saved = await persistCategories({ push_enabled: false }, 'push_enabled');
    if (!saved) return;
    try {
      await unregisterCurrentPushInstallation();
      const current = useAuthStore.getState().profile;
      if (current) useAuthStore.getState().setProfile({ ...current, notification_token: null });
    } catch (error) {
      if (__DEV__) console.warn('[notifications] token cleanup failed', error);
    }
    Toast.show({ type: 'success', text1: 'Phone alerts turned off' });
  }, [persistCategories]);

  const onMasterSystemSwitch = useCallback(
    async (value: boolean) => {
      Haptics.selectionAsync();
      setPrefs((current) => ({ ...current, push_enabled: value }));
      if (Platform.OS === 'web') {
        Toast.show({ type: 'info', text1: 'Use the mobile app for system alerts.' });
        return;
      }
      if (value) {
        await enableSystemAlerts();
        return;
      }
      await disableSystemAlerts();
    },
    [disableSystemAlerts, enableSystemAlerts],
  );

  const masterEnabled = prefs.push_enabled && permStatus === 'granted';
  const categoriesDisabled =
    Platform.OS === 'web' ? true : !masterEnabled || Boolean(savingKey);

  return (
    <SafeAreaView style={[styles.container, webScrollParentStyle]}>
      <ScrollView
        style={webScrollParentStyle}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              goBackToExplicitReturn(router, returnTo, '/(app)/profile/settings' as Href);
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
                    Get alerts when a Doji goes live and when friends interact.
                  </Text>
                </View>
                <Switch
                  value={masterEnabled}
                  onValueChange={onMasterSystemSwitch}
                  disabled={Boolean(savingKey)}
                  accessibilityLabel="Alerts on this phone"
                  accessibilityHint="Turns Doji phone notifications on or off."
                  {...themedSwitchProps(masterEnabled, { disabled: Boolean(savingKey) })}
                />
              </View>
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
                  {...themedSwitchProps(prefs[row.key], { disabled: categoriesDisabled })}
                />
              </View>
            ))}
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
