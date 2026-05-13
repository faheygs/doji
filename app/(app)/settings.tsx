import React, { useMemo, useState } from 'react';
import { Alert, View, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/useAuthStore';
import { Spacing, Radius, webScrollParentStyle, type ThemeName } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../../components/ui/Text';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { IconChevronLeft } from '../../components/icons/Icons';

const THEME_OPTIONS: { key: ThemeName; label: string; color: string }[] = [
  { key: 'coral', label: 'Coral', color: '#F97316' },
  { key: 'ocean', label: 'Ocean', color: '#3B82F6' },
  { key: 'midnight', label: 'Midnight', color: '#A78BFA' },
  { key: 'forest', label: 'Forest', color: '#059669' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { profile, updateProfile, signOut } = useAuthStore();
  const { colors, setPreference, preference } = useTheme();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

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
        sectionTitle: { marginBottom: Spacing.sm, paddingHorizontal: Spacing.xs },
        card: { gap: Spacing.md },
        fieldGroup: { gap: Spacing.md },
        themeRow: {
          flexDirection: 'row',
          gap: Spacing.sm,
        },
        themeBtn: {
          flex: 1,
          height: 48,
          borderRadius: Radius.md,
          borderWidth: 2,
          alignItems: 'center',
          justifyContent: 'center',
        },
        themeDot: {
          width: 10,
          height: 10,
          borderRadius: 5,
          position: 'absolute',
          top: 6,
          right: 6,
        },
        version: { textAlign: 'center', marginTop: Spacing.md },
      }),
    [colors],
  );

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await updateProfile({ display_name: displayName.trim(), bio: bio.trim() || null });
      Toast.show({ type: 'success', text1: 'Profile updated!' });
    } catch {
      Toast.show({ type: 'error', text1: 'Failed to save changes' });
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
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              router.navigate('/(app)/profile');
            }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Back to profile"
          >
            <IconChevronLeft size={26} color={colors.text} />
          </TouchableOpacity>
          <Text variant="headingLarge" style={{ flex: 1 }}>
            Settings
          </Text>
        </View>

        {/* Theme Picker — pill row */}
        <View style={styles.section}>
          <Text variant="headingMedium" style={styles.sectionTitle}>Theme</Text>
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map((opt) => {
              const active = preference === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  onPress={async () => {
                    if (active) return;
                    Haptics.selectionAsync();
                    try {
                      await setPreference(opt.key);
                    } catch {
                      Toast.show({ type: 'error', text1: 'Failed to save theme' });
                    }
                  }}
                  style={[
                    styles.themeBtn,
                    {
                      borderColor: active ? opt.color : colors.border,
                      backgroundColor: active ? `${opt.color}18` : colors.surface,
                    },
                  ]}
                  activeOpacity={0.85}
                >
                  {active && <View style={[styles.themeDot, { backgroundColor: opt.color }]} />}
                  <Text variant="micro" color={active ? opt.color : colors.textSecondary}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Profile Edit */}
        <View style={styles.section}>
          <Text variant="headingMedium" style={styles.sectionTitle}>Edit Profile</Text>
          <Card style={styles.card}>
            <View style={styles.fieldGroup}>
              <Input
                label="User ID"
                value={`@${profile?.username ?? ''}`}
                editable={false}
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
            <Button onPress={handleSaveProfile} loading={saving} disabled={!displayName.trim()} size="md">
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
                router.push('/(app)/notifications');
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
