import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';
import { Spacing, Radius, webScrollParentStyle } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/stores/useAuthStore';
import { AppKeyboardAwareScrollView } from '@/components/ui/AppKeyboardAwareScrollView';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { IconCamera, IconChevronLeft } from '@/components/icons/Icons';
import { useChangeProfilePhoto } from '@/hooks/useChangeProfilePhoto';
import { useUsernameAvailability, normalizeUsernameInput } from '@/hooks/useUsernameAvailability';
import { maxLength, validationMessage } from '@/lib/formValidation';
import { goBackWithOptionalReturn } from '@/lib/navigationReturn';

const BIO_MAX = 150;

export default function EditProfileScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { colors } = useTheme();
  const profile = useAuthStore((state) => state.profile);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const { openChangePhotoDialog, uploading } = useChangeProfilePhoto();
  const [username, setUsername] = useState(profile?.username ?? '');
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setUsername(profile?.username ?? '');
    setDisplayName(profile?.display_name ?? '');
    setBio(profile?.bio ?? '');
  }, [profile?.username, profile?.display_name, profile?.bio]);

  const availability = useUsernameAvailability(username, {
    treatAsUnchangedIfMatches: profile?.username,
    ownUserId: profile?.id,
  });
  const bioValidation = useMemo(() => maxLength(bio, BIO_MAX), [bio]);
  const canSave =
    bioValidation.ok &&
    !!username.trim() &&
    availability.isOkForSubmit &&
    availability.status !== 'checking';

  const goBack = () =>
    goBackWithOptionalReturn(router, returnTo, '/(app)/profile/settings' as Href);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const handle = normalizeUsernameInput(username);
      await updateProfile({
        username: handle,
        display_name: displayName.trim() || handle,
        bio: bio.trim() || null,
      });
      Toast.show({ type: 'success', text1: 'Profile updated' });
      goBack();
    } catch {
      Toast.show({ type: 'error', text1: 'Could not save — username may already be taken' });
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return null;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }, webScrollParentStyle]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={12}
          onPress={() => {
            Haptics.selectionAsync();
            goBack();
          }}
        >
          <IconChevronLeft size={26} color={colors.text} />
        </TouchableOpacity>
        <Text variant="headingLarge">Edit profile</Text>
      </View>
      <AppKeyboardAwareScrollView
        style={webScrollParentStyle}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
          disabled={uploading}
          activeOpacity={0.8}
          onPress={openChangePhotoDialog}
          style={styles.photo}
        >
          <ProfileAvatar profile={profile} size={88} />
          <View style={[styles.camera, { backgroundColor: colors.primary, borderColor: colors.background }]}>
            {uploading ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <IconCamera size={16} color={colors.onPrimary} />
            )}
          </View>
        </TouchableOpacity>
        <View style={[styles.form, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <Input
            label="Username"
            value={username}
            onChangeText={(value) => setUsername(normalizeUsernameInput(value))}
            autoCapitalize="none"
            autoCorrect={false}
            error={
              ['invalid', 'taken', 'error'].includes(availability.status)
                ? availability.errorMessage
                : undefined
            }
          />
          <Input
            label="Display name (optional)"
            value={displayName}
            onChangeText={setDisplayName}
          />
          <Input
            label="Bio (optional)"
            value={bio}
            onChangeText={(value) => setBio(value.slice(0, BIO_MAX))}
            multiline
            numberOfLines={3}
            hint={`${bio.length}/${BIO_MAX}`}
            error={validationMessage(bioValidation)}
          />
          <Button onPress={() => void save()} loading={saving} disabled={!canSave}>
            Save changes
          </Button>
        </View>
      </AppKeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  content: { paddingBottom: Spacing.xxl, gap: Spacing.lg },
  photo: { alignSelf: 'center', position: 'relative', marginTop: Spacing.sm },
  camera: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: {
    marginHorizontal: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
});
