import React, { useMemo, useState } from 'react';
import { Linking, View, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { useRouter, usePathname, useLocalSearchParams, type Href } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import { Spacing, Radius, webScrollParentStyle } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { AppKeyboardAwareScrollView } from '@/components/ui/AppKeyboardAwareScrollView';
import { IconChevronLeft } from '@/components/icons/Icons';
import { hrefWithReturnTo, goBackWithOptionalReturn } from '@/lib/navigationReturn';
import { useBlockedUserCount } from '@/hooks/useBlockUser';
import { usePendingSuggestions } from '@/hooks/useSuggestions';
import { usePendingReports } from '@/hooks/useReports';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';
import { ChangePasswordSheet } from '@/components/settings/ChangePasswordSheet';
import { SettingsRow } from '@/components/settings/SettingsGroup';
import { useAppDialog } from '@/contexts/DialogContext';
import { InlineFeedback } from '@/components/ui/InlineFeedback';

export default function SettingsScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { profile, signOut } = useAuthStore();
  const { colors } = useTheme();
  const { showDialog } = useAppDialog();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const { data: pendingSuggestions = [], isError: pendingSuggestionsError } = usePendingSuggestions(
    !!profile?.is_admin,
  );
  const { data: pendingReports = [] } = usePendingReports(!!profile?.is_admin);
  const { data: blockedUserCount = 0 } = useBlockedUserCount();

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
        sectionLabel: {
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.lg,
          paddingBottom: Spacing.xs,
        },
        group: {
          marginHorizontal: Spacing.md,
          borderRadius: Radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceElevated,
          overflow: 'hidden',
        },
        profileCard: {
          marginHorizontal: Spacing.md,
          padding: Spacing.md,
          borderRadius: Radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceElevated,
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.md,
        },
        version: { textAlign: 'center', marginTop: Spacing.lg },
      }),
    [colors],
  );

  const handleDeleteAccount = () => {
    setDeleteError('');
    showDialog({
      title: 'Delete account',
      message: 'This permanently deletes your account and all its data. This cannot be undone.',
      actions: [
        { label: 'Cancel', variant: 'cancel' },
        {
          label: 'Delete',
          variant: 'destructive',
          onPress: async () => {
            try {
              const userId = useAuthStore.getState().session?.user?.id;
              if (!userId) return;
              const { error } = await supabase.functions.invoke('delete-account');
              if (error) throw error;
              await signOut();
              Toast.show({ type: 'success', text1: 'Account deleted' });
            } catch {
              setDeleteError('Could not delete your account. Try again or contact support.');
            }
          },
        },
      ],
    });
  };

  return (
    <SafeAreaView style={[styles.container, webScrollParentStyle]}>
      <AppKeyboardAwareScrollView
        style={webScrollParentStyle}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              goBackWithOptionalReturn(router, returnTo, '/(app)/profile' as Href);
            }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <IconChevronLeft size={26} color={colors.text} />
          </TouchableOpacity>
          <Text variant="headingLarge" style={{ flex: 1 }}>
            Settings
          </Text>
        </View>
        {deleteError ? (
          <InlineFeedback
            title="Account was not deleted"
            message={deleteError}
            style={{ marginHorizontal: Spacing.md }}
          />
        ) : null}

        <TouchableOpacity
          style={styles.profileCard}
          onPress={() => {
            Haptics.selectionAsync();
            router.push(hrefWithReturnTo('/(app)/profile/edit', pathname));
          }}
          activeOpacity={0.78}
        >
          <ProfileAvatar profile={profile} size={52} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="subhead">{profile?.display_name || profile?.username}</Text>
            <Text variant="micro" color={colors.textTertiary}>
              @{profile?.username} · Edit profile
            </Text>
          </View>
        </TouchableOpacity>

        <Text variant="label" color={colors.textTertiary} style={styles.sectionLabel}>
          SECURITY
        </Text>
        <View style={styles.group}>
          <SettingsRow
            label="Change password"
            subtitle="Update your account password"
            onPress={() => setPasswordOpen(true)}
            isLast
          />
        </View>

        <Text variant="label" color={colors.textTertiary} style={styles.sectionLabel}>
          NOTIFICATIONS
        </Text>
        <View style={styles.group}>
          <SettingsRow
            label="Notification settings"
            subtitle="Alerts, Doji, friends, reactions, and more"
            onPress={() => {
              Haptics.selectionAsync();
              router.push(hrefWithReturnTo('/(app)/notifications', pathname));
            }}
            isLast
          />
        </View>

        <Text variant="label" color={colors.textTertiary} style={styles.sectionLabel}>
          LEGAL
        </Text>
        <View style={styles.group}>
          <SettingsRow
            label="Terms of Use"
            onPress={() => {
              Haptics.selectionAsync();
              router.push(hrefWithReturnTo('/(app)/legal/terms', pathname));
            }}
          />
          <SettingsRow
            label="Privacy Policy"
            onPress={() => {
              Haptics.selectionAsync();
              router.push(hrefWithReturnTo('/(app)/legal/privacy', pathname));
            }}
            isLast
          />
        </View>

        <Text variant="label" color={colors.textTertiary} style={styles.sectionLabel}>
          PRIVACY
        </Text>
        <View style={styles.group}>
          <SettingsRow
            label="Blocked users"
            subtitle={
              blockedUserCount > 0 ? `${blockedUserCount} blocked` : 'Manage blocked accounts'
            }
            onPress={() => {
              Haptics.selectionAsync();
              router.push(hrefWithReturnTo('/(app)/profile/blocked-users', pathname));
            }}
            isLast
          />
        </View>

        <Text variant="label" color={colors.textTertiary} style={styles.sectionLabel}>
          APPEARANCE
        </Text>
        <View style={styles.group}>
          <SettingsRow
            label="Themes & colors"
            subtitle="Accent colors and appearance"
            onPress={() => {
              Haptics.selectionAsync();
              router.push(hrefWithReturnTo('/(app)/profile/appearance', pathname));
            }}
          />
          <SettingsRow
            label="Shop"
            subtitle="Spend Sparks on themes, frames, and titles"
            onPress={() => {
              Haptics.selectionAsync();
              router.push(hrefWithReturnTo('/(app)/profile/shop', pathname));
            }}
            isLast
          />
        </View>

        <Text variant="label" color={colors.textTertiary} style={styles.sectionLabel}>
          SUPPORT
        </Text>
        <View style={styles.group}>
          <SettingsRow
            label="Help & support"
            subtitle="Support, safety, and account help"
            onPress={() => {
              Haptics.selectionAsync();
              void Linking.openURL('https://dojipro.com/support/');
            }}
          />
          <SettingsRow
            label="Sign out"
            onPress={async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              await signOut();
            }}
          />
          <SettingsRow label="Delete account" danger onPress={handleDeleteAccount} isLast />
        </View>

        {profile?.is_admin ? (
          <>
            <Text variant="label" color={colors.textTertiary} style={styles.sectionLabel}>
              ADMIN
            </Text>
            <View style={styles.group}>
              <SettingsRow
                label="Review suggestions"
                subtitle="Approve or reject pending challenge ideas"
                right={
                  pendingSuggestionsError ? (
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: colors.error,
                      }}
                    />
                  ) : pendingSuggestions.length > 0 ? (
                    <View
                      style={{
                        minWidth: 22,
                        height: 22,
                        borderRadius: 11,
                        backgroundColor: colors.warning,
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingHorizontal: 6,
                      }}
                    >
                      <Text variant="micro" color={colors.onPrimary} style={{ fontWeight: '700' }}>
                        {pendingSuggestions.length}
                      </Text>
                    </View>
                  ) : undefined
                }
                onPress={() => {
                  Haptics.selectionAsync();
                  router.push(hrefWithReturnTo('/(app)/admin/suggestions', pathname));
                }}
              />
              <SettingsRow
                label="Review reports"
                subtitle="Moderate flagged content and blocked users"
                right={
                  pendingReports.length > 0 ? (
                    <View
                      style={{
                        minWidth: 22,
                        height: 22,
                        borderRadius: 11,
                        backgroundColor: colors.error,
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingHorizontal: 6,
                      }}
                    >
                      <Text variant="micro" color={colors.onPrimary} style={{ fontWeight: '700' }}>
                        {pendingReports.length}
                      </Text>
                    </View>
                  ) : undefined
                }
                onPress={() => {
                  Haptics.selectionAsync();
                  router.push(hrefWithReturnTo('/(app)/admin/reports', pathname));
                }}
                isLast
              />
            </View>
          </>
        ) : null}

        <Text variant="bodySmall" color={colors.textTertiary} style={styles.version}>
          Doji {Constants.expoConfig?.version ?? '1.0.0'}{Constants.nativeBuildVersion ? ` (${Constants.nativeBuildVersion})` : ''}
        </Text>
      </AppKeyboardAwareScrollView>
      <ChangePasswordSheet visible={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </SafeAreaView>
  );
}
