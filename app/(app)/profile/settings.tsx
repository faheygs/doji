import React, { useMemo, useState, useEffect } from 'react';
import {
  Alert,
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, usePathname, useLocalSearchParams, type Href } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import { Spacing, Radius, webScrollParentStyle, themeMap, type ThemeName } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconChevronLeft } from '@/components/icons/Icons';
import { hrefWithReturnTo, goBackWithOptionalReturn } from '@/lib/navigationReturn';
import { useUsernameAvailability, normalizeUsernameInput } from '@/hooks/useUsernameAvailability';

const THEME_GRID_META = [
  { key: 'coral' as const, label: 'Coral', mode: 'Light' as const },
  { key: 'ocean' as const, label: 'Ocean', mode: 'Light' as const },
  { key: 'forest' as const, label: 'Forest', mode: 'Light' as const },
  { key: 'blossom' as const, label: 'Blossom', mode: 'Light' as const },
  { key: 'midnight' as const, label: 'Midnight', mode: 'Dark' as const },
  { key: 'aurora' as const, label: 'Aurora', mode: 'Dark' as const },
] satisfies readonly { key: ThemeName; label: string; mode: 'Light' | 'Dark' }[];

export default function SettingsScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { profile, updateProfile, signOut } = useAuthStore();
  const { colors, setPreference, preference } = useTheme();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [usernameEdit, setUsernameEdit] = useState(profile?.username ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const {
    errorMessage: usernameAvailabilityError,
    isOkForSubmit: usernameSaveOk,
    status: usernameAvailabilityStatus,
  } = useUsernameAvailability(usernameEdit, {
    treatAsUnchangedIfMatches: profile?.username,
    ownUserId: profile?.id,
  });

  useEffect(() => {
    setDisplayName(profile?.display_name ?? '');
    setUsernameEdit(profile?.username ?? '');
    setBio(profile?.bio ?? '');
  }, [profile?.display_name, profile?.username, profile?.bio]);

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
        section: { paddingHorizontal: Spacing.md, marginBottom: Spacing.lg },
        sectionTitle: { marginBottom: Spacing.xs, paddingHorizontal: Spacing.xs },
        themeHint: {
          marginBottom: Spacing.sm,
          paddingHorizontal: Spacing.xs,
        },
        themeScrollContent: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.xs,
          paddingHorizontal: Spacing.xs,
          paddingBottom: 2,
        },
        themeChip: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingVertical: 9,
          paddingHorizontal: 12,
          borderRadius: Radius.full,
          borderWidth: StyleSheet.hairlineWidth,
        },
        themeSwatch: {
          width: 3,
          height: 18,
          borderRadius: 2,
          overflow: 'hidden',
        },
        card: { gap: Spacing.md },
        fieldGroup: { gap: Spacing.md },
        version: { textAlign: 'center', marginTop: Spacing.md },
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
    } catch {
      Toast.show({
        type: 'error',
        text1: 'Could not save — username may already be taken',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateEmail = async () => {
    if (!email.trim()) return;
    try {
      const { error } = await supabase.auth.updateUser({ email: email.trim() });
      if (error) throw error;
      Toast.show({ type: 'success', text1: 'Check your email for confirmation' });
      setEmail('');
    } catch {
      Toast.show({ type: 'error', text1: 'Failed to update email' });
    }
  };

  const handleUpdatePassword = async () => {
    if (newPassword.length < 6) {
      Toast.show({ type: 'error', text1: 'Password must be at least 6 characters' });
      return;
    }
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      Toast.show({ type: 'success', text1: 'Password updated!' });
      setNewPassword('');
    } catch {
      Toast.show({ type: 'error', text1: 'Failed to update password' });
    }
  };

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
              await supabase.from('reactions').delete().eq('user_id', userId);
              await supabase.from('posts').delete().eq('user_id', userId);
              await supabase.from('user_events').delete().eq('user_id', userId);
              await supabase.from('streak_events').delete().eq('user_id', userId);
              await supabase.from('friendships').delete().or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
              await supabase.from('profiles').delete().eq('id', userId);
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

        {/* Theme — compact horizontal chips */}
        <View style={styles.section}>
          <Text variant="headingMedium" style={styles.sectionTitle}>
            Theme
          </Text>
          <Text variant="micro" color={colors.textTertiary} style={styles.themeHint}>
            Saved to your profile.
          </Text>
          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.themeScrollContent}
          >
            {THEME_GRID_META.map((meta) => {
              const active = preference === meta.key;
              const tc = themeMap[meta.key];
              return (
                <TouchableOpacity
                  key={meta.key}
                  onPress={async () => {
                    if (active) return;
                    Haptics.selectionAsync();
                    try {
                      await setPreference(meta.key);
                    } catch {
                      Toast.show({ type: 'error', text1: 'Failed to save theme' });
                    }
                  }}
                  style={[
                    styles.themeChip,
                    {
                      borderColor: active ? colors.primary : colors.hairline,
                      backgroundColor: active ? colors.primaryLight : colors.surface,
                    },
                  ]}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${meta.label} theme, ${meta.mode}`}
                >
                  <View style={styles.themeSwatch}>
                    <LinearGradient
                      colors={[tc.xpGradientStart, tc.xpGradientEnd]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={StyleSheet.absoluteFillObject}
                    />
                  </View>
                  <Text
                    variant="caption"
                    numberOfLines={1}
                    style={{
                      fontWeight: '700',
                      color: active ? colors.text : colors.textSecondary,
                      letterSpacing: -0.2,
                    }}
                  >
                    {meta.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Profile Edit */}
        <View style={styles.section}>
          <Text variant="headingMedium" style={styles.sectionTitle}>Edit Profile</Text>
          <Card style={styles.card}>
            <View style={styles.fieldGroup}>
              <Input
                label="Username"
                value={usernameEdit}
                onChangeText={(v) => setUsernameEdit(normalizeUsernameInput(v))}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="your_handle"
                error={
                  usernameAvailabilityStatus === 'invalid' ||
                  usernameAvailabilityStatus === 'taken' ||
                  usernameAvailabilityStatus === 'error'
                    ? usernameAvailabilityError
                    : undefined
                }
              />
              <Input label="Display name" value={displayName} onChangeText={setDisplayName} />
              <Input
                label="Bio"
                value={bio}
                onChangeText={setBio}
                placeholder="Tell people who you are…"
                multiline
                numberOfLines={3}
              />
            </View>
            <Button
              onPress={handleSaveProfile}
              loading={saving}
              disabled={
                !displayName.trim() ||
                !usernameEdit.trim() ||
                !usernameSaveOk ||
                usernameAvailabilityStatus === 'checking'
              }
              size="md"
            >
              Save changes
            </Button>
          </Card>
        </View>

        {/* Email + Password in one card */}
        <View style={styles.section}>
          <Text variant="headingMedium" style={styles.sectionTitle}>Account</Text>
          <Card style={styles.card}>
            <Input
              label="New email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Button onPress={handleUpdateEmail} disabled={!email.trim()} size="md">
              Update email
            </Button>
            <View style={{ height: Spacing.sm }} />
            <Input
              label="New password"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
            />
            <Button onPress={handleUpdatePassword} disabled={newPassword.length < 6} size="md">
              Update password
            </Button>
          </Card>
        </View>

        {/* Notifications */}
        <View style={styles.section}>
          <Text variant="headingMedium" style={styles.sectionTitle}>Notifications</Text>
          <Card style={styles.card}>
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                router.push(hrefWithReturnTo('/(app)/notifications', pathname));
              }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityHint="Opens notification types and permission"
              style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="body">Notification settings</Text>
                <Text variant="micro" color={colors.textTertiary}>
                  Turn alerts on or off, choose Doji, friends, reactions, and more.
                </Text>
              </View>
              <Text variant="body" color={colors.textTertiary}>
                →
              </Text>
            </TouchableOpacity>
          </Card>
        </View>

        {/* Sign Out */}
        <View style={styles.section}>
          <Button
            onPress={async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              await signOut();
            }}
            variant="danger"
            fullWidth
            size="lg"
          >
            Sign out
          </Button>
        </View>

        <View style={styles.section}>
          <TouchableOpacity onPress={handleDeleteAccount} style={{ alignSelf: 'center', padding: Spacing.sm }}>
            <Text variant="bodySmall" color={colors.error}>Delete my account</Text>
          </TouchableOpacity>
        </View>

        <Text variant="bodySmall" color={colors.textTertiary} style={styles.version}>
          Doji v1.0.0
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
