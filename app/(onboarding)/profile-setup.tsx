import React, { useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import Toast from 'react-native-toast-message';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { IconCamera } from '@/components/icons/Icons';
import { TouchableOpacity } from 'react-native';
import { useAuthStore } from '@/stores/useAuthStore';
import { useChangeProfilePhoto } from '@/hooks/useChangeProfilePhoto';
import { required, validationMessage } from '@/lib/formValidation';
import { safeReplace, FEED_TAB_HREF } from '@/lib/routes';

const BIO_MAX = 150;

export default function OnboardingProfileSetupScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [saving, setSaving] = useState(false);
  const [displayNameTouched, setDisplayNameTouched] = useState(false);
  const { openChangePhotoDialog, uploading } = useChangeProfilePhoto();

  const displayNameValidation = useMemo(
    () => required(displayName, 'Display name is required.'),
    [displayName],
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        content: {
          flexGrow: 1,
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.xxl,
          gap: Spacing.lg,
          paddingBottom: Spacing.lg,
        },
        avatarWrap: { alignSelf: 'center', position: 'relative' },
        editFab: {
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 2,
          borderColor: colors.background,
        },
        footer: { marginTop: 'auto' as const, gap: Spacing.sm },
      }),
    [colors],
  );

  const saveAndContinue = async (skip = false) => {
    setSaving(true);
    try {
      if (!skip) {
        if (!displayNameValidation.ok) {
          setDisplayNameTouched(true);
          Toast.show({ type: 'error', text1: displayNameValidation.message });
          return;
        }
        await updateProfile({
          display_name: displayName.trim(),
          bio: bio.trim().slice(0, BIO_MAX) || null,
        });
      }
      await updateProfile({ onboarding_completed_at: new Date().toISOString() });
      safeReplace(router, FEED_TAB_HREF);
    } catch {
      Toast.show({ type: 'error', text1: 'Could not save profile' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View>
            <Text variant="displayMedium">Set up your profile</Text>
            <Text variant="body" color={colors.textSecondary} style={{ marginTop: Spacing.xs }}>
              You can always change this later.
            </Text>
          </View>

          <View style={styles.avatarWrap}>
            <Avatar
              uri={profile?.avatar_url}
              username={profile?.username ?? 'you'}
              size={88}
              fallbackTone="brand"
            />
            <TouchableOpacity style={styles.editFab} onPress={openChangePhotoDialog} disabled={uploading}>
              {uploading ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <IconCamera size={14} color={colors.onPrimary} />
              )}
            </TouchableOpacity>
          </View>

          <Input
            label="Display name"
            value={displayName}
            onChangeText={setDisplayName}
            onBlur={() => setDisplayNameTouched(true)}
            error={
              displayNameTouched ? validationMessage(displayNameValidation) : undefined
            }
          />
          <Input
            label="Bio (optional)"
            value={bio}
            onChangeText={(v) => setBio(v.slice(0, BIO_MAX))}
            multiline
            numberOfLines={3}
            placeholder="Tell people who you are…"
            hint={`${bio.length}/${BIO_MAX}`}
          />

          <View style={styles.footer}>
            <Button
              onPress={() => void saveAndContinue(false)}
              loading={saving}
              fullWidth
              size="lg"
              disabled={!displayNameValidation.ok}
            >
              Continue
            </Button>
            <Button variant="ghost" onPress={() => void saveAndContinue(true)} fullWidth size="md">
              Skip for now
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
