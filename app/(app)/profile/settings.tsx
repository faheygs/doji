import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  Alert,
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';
import { useRouter, usePathname, useLocalSearchParams, type Href } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import { Spacing, Radius, webScrollParentStyle, type ThemeName } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { IconChevronLeft } from '@/components/icons/Icons';
import { hrefWithReturnTo, goBackWithOptionalReturn } from '@/lib/navigationReturn';
import { useUsernameAvailability, normalizeUsernameInput } from '@/hooks/useUsernameAvailability';
import { usePendingSuggestions } from '@/hooks/useSuggestions';
import { required, maxLength, validationMessage } from '@/lib/formValidation';

const BIO_MAX = 150;

type SettingsRowProps = {
  label: string;
  onPress?: () => void;
  danger?: boolean;
  right?: React.ReactNode;
  subtitle?: string;
  showChevron?: boolean;
  isLast?: boolean;
};

function SettingsRow({
  label,
  onPress,
  danger,
  right,
  subtitle,
  showChevron = true,
  isLast,
}: SettingsRowProps) {
  const { colors } = useTheme();
  const content = (
    <View
      style={[
        rowStyles.row,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" color={danger ? colors.error : colors.text} style={{ fontWeight: '500' }}>
          {label}
        </Text>
        {subtitle ? (
          <Text variant="micro" color={colors.textTertiary}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? (showChevron ? <Text variant="body" color={colors.textTertiary}>›</Text> : null)}
    </View>
  );

  if (!onPress) return content;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} accessibilityRole="button">
      {content}
    </TouchableOpacity>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
});

export default function SettingsScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { profile, updateProfile, signOut } = useAuthStore();
  const { colors, setPreference, preference, isDark } = useTheme();
  const [editOpen, setEditOpen] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [usernameEdit, setUsernameEdit] = useState(profile?.username ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [saving, setSaving] = useState(false);
  const [privateAccount, setPrivateAccount] = useState(profile?.is_private ?? false);
  const { data: pendingSuggestions = [], isError: pendingSuggestionsError } = usePendingSuggestions(
    !!profile?.is_admin,
  );

  const {
    errorMessage: usernameAvailabilityError,
    isOkForSubmit: usernameSaveOk,
    status: usernameAvailabilityStatus,
  } = useUsernameAvailability(usernameEdit, {
    treatAsUnchangedIfMatches: profile?.username,
    ownUserId: profile?.id,
  });

  const displayNameValidation = useMemo(() => required(displayName, 'Display name is required.'), [displayName]);
  const bioValidation = useMemo(() => maxLength(bio, BIO_MAX), [bio]);

  useEffect(() => {
    setDisplayName(profile?.display_name ?? '');
    setUsernameEdit(profile?.username ?? '');
    setBio(profile?.bio ?? '');
    setPrivateAccount(profile?.is_private ?? false);
  }, [profile?.display_name, profile?.username, profile?.bio, profile?.is_private]);

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
        editCard: {
          marginHorizontal: Spacing.md,
          marginTop: Spacing.sm,
          padding: Spacing.md,
          borderRadius: Radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceElevated,
          gap: Spacing.md,
        },
        version: { textAlign: 'center', marginTop: Spacing.lg },
      }),
    [colors],
  );

  const handleSaveProfile = async () => {
    const handle = normalizeUsernameInput(usernameEdit);
    if (!usernameSaveOk || usernameAvailabilityStatus === 'checking') {
      if (usernameAvailabilityError) {
        Toast.show({ type: 'error', text1: usernameAvailabilityError });
      }
      return;
    }
    setSaving(true);
    try {
      await updateProfile({
        username: handle,
        display_name: displayName.trim(),
        bio: bio.trim() || null,
      });
      Toast.show({ type: 'success', text1: 'Profile updated!' });
      setEditOpen(false);
    } catch {
      Toast.show({ type: 'error', text1: 'Could not save — username may already be taken' });
    } finally {
      setSaving(false);
    }
  };

  const handleThemeToggle = useCallback(
    async (dark: boolean) => {
      const next: ThemeName = dark ? 'dark' : 'light';
      if (next === preference) return;
      Haptics.selectionAsync();
      try {
        await setPreference(next);
      } catch {
        Toast.show({ type: 'error', text1: 'Failed to save theme' });
      }
    },
    [preference, setPreference],
  );

  const handlePrivacyToggle = useCallback(
    async (next: boolean) => {
      setPrivateAccount(next);
      Haptics.selectionAsync();
      try {
        await updateProfile({ is_private: next });
      } catch {
        setPrivateAccount(!next);
        Toast.show({ type: 'error', text1: 'Failed to update privacy' });
      }
    },
    [updateProfile],
  );

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account',
      'This will permanently delete your account and all your data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const userId = useAuthStore.getState().session?.user?.id;
              if (!userId) return;
              const { error } = await supabase.functions.invoke('delete-account');
              if (error) throw error;
              await signOut();
              Toast.show({ type: 'success', text1: 'Account deleted' });
            } catch {
              Toast.show({ type: 'error', text1: 'Failed to delete account. Contact support.' });
            }
          },
        },
      ],
    );
  };

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

        <Text variant="label" color={colors.textTertiary} style={styles.sectionLabel}>
          ACCOUNT
        </Text>
        <View style={styles.group}>
          <SettingsRow
            label="Edit profile"
            onPress={() => {
              Haptics.selectionAsync();
              setEditOpen((v) => !v);
            }}
          />
          <SettingsRow
            label="Change password"
            subtitle="Coming soon"
            onPress={() => Toast.show({ type: 'info', text1: 'Password changes coming soon' })}
            isLast
          />
        </View>

        {editOpen ? (
          <View style={styles.editCard}>
            <Input
              label="Username"
              value={usernameEdit}
              onChangeText={(v) => setUsernameEdit(normalizeUsernameInput(v))}
              autoCapitalize="none"
              autoCorrect={false}
              error={
                usernameAvailabilityStatus === 'invalid' ||
                usernameAvailabilityStatus === 'taken' ||
                usernameAvailabilityStatus === 'error'
                  ? usernameAvailabilityError
                  : undefined
              }
            />
            <Input
              label="Display name"
              value={displayName}
              onChangeText={setDisplayName}
              error={validationMessage(displayNameValidation)}
            />
            <Input
              label="Bio"
              value={bio}
              onChangeText={(v) => setBio(v.slice(0, BIO_MAX))}
              placeholder="Tell people who you are…"
              multiline
              numberOfLines={3}
              hint={`${bio.length}/${BIO_MAX}`}
              error={validationMessage(bioValidation)}
            />
            <Button
              onPress={handleSaveProfile}
              loading={saving}
              disabled={
                !displayNameValidation.ok ||
                !bioValidation.ok ||
                !usernameEdit.trim() ||
                !usernameSaveOk ||
                usernameAvailabilityStatus === 'checking'
              }
              size="md"
            >
              Save changes
            </Button>
          </View>
        ) : null}

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
          APPEARANCE
        </Text>
        <View style={styles.group}>
          <SettingsRow
            label="Dark mode"
            subtitle="Use dark background"
            showChevron={false}
            right={
              <Switch
                value={isDark}
                onValueChange={handleThemeToggle}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            }
            isLast
          />
        </View>

        <Text variant="label" color={colors.textTertiary} style={styles.sectionLabel}>
          PRIVACY
        </Text>
        <View style={styles.group}>
          <SettingsRow
            label="Private account"
            subtitle={
              privateAccount
                ? 'Only approved followers see your responses'
                : 'Anyone on Doji can see your responses'
            }
            showChevron={false}
            right={
              <Switch
                value={privateAccount}
                onValueChange={handlePrivacyToggle}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            }
            isLast
          />
        </View>

        <Text variant="label" color={colors.textTertiary} style={styles.sectionLabel}>
          SUPPORT
        </Text>
        <View style={styles.group}>
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
                isLast
              />
            </View>
          </>
        ) : null}

        <Text variant="bodySmall" color={colors.textTertiary} style={styles.version}>
          Doji v1.0.0
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
