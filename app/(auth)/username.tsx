import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  TouchableOpacity,
  View,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/useAuthStore';
import { ROUTES } from '../../lib/routes';
import { Spacing, DEFAULT_APP_THEME } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../../components/ui/Text';
import { Input } from '../../components/ui/Input';
import { AppKeyboardAwareScrollView } from '../../components/ui/AppKeyboardAwareScrollView';
import { Button } from '../../components/ui/Button';
import { useUsernameAvailability, normalizeUsernameInput } from '../../hooks/useUsernameAvailability';
import { Avatar } from '../../components/ui/Avatar';
import { IconCamera } from '../../components/icons/Icons';
import * as ImagePicker from 'expo-image-picker';
import { uploadAvatar } from '../../utils/upload';
import { filterContent } from '../../lib/contentFilter';
import { useAppDialog } from '../../contexts/DialogContext';
import { showProfilePhotoDialog } from '../../lib/profilePhotoDialog';

const BIO_MAX = 150;

export default function UsernameScreen() {
  const router = useRouter();
  const { session, fetchProfile } = useAuthStore();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { showDialog } = useAppDialog();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    errorMessage: usernameAvailabilityError,
    isOkForSubmit: usernameOk,
    status: usernameAvailabilityStatus,
  } = useUsernameAvailability(username, { ownUserId: session?.user?.id });

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        keyboardView: {
          flex: 1,
        },
        content: {
          flexGrow: 1,
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.xxl,
          gap: Spacing.lg,
          paddingBottom: Spacing.lg,
        },
        inputs: {
          gap: Spacing.md,
          marginTop: Spacing.md,
        },
        avatarWrap: { alignSelf: 'center', alignItems: 'center', gap: Spacing.xs },
        avatarTouchable: { position: 'relative' },
        editFab: {
          position: 'absolute',
          right: -4,
          bottom: -4,
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 2,
          borderColor: colors.background,
        },
        footer: {
          marginTop: 'auto' as any,
          paddingTop: Spacing.xl,
        },
      }),
    [colors.background],
  );

  const handleCreate = async () => {
    if (!usernameOk || usernameAvailabilityStatus === 'checking') return;
    const userId = session?.user?.id;
    if (!userId) return;

    const handle = normalizeUsernameInput(username);
    const optionalText = [displayName, bio].map(filterContent).find((result) => !result.ok);
    if (optionalText && !optionalText.ok) {
      Toast.show({ type: 'error', text1: optionalText.reason });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.rpc('create_own_profile', {
        p_username: handle,
        p_display_name: displayName.trim() || handle,
        p_avatar_gradient: [colors.xpGradientStart, colors.xpGradientEnd],
        p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        p_app_theme: DEFAULT_APP_THEME,
      });

      if (error) {
        if (error.code === '23505') {
          // Race: hook may have missed a concurrent signup
          Toast.show({ type: 'error', text1: 'That username was just taken. Pick another.' });
        } else {
          throw error;
        }
        return;
      }

      await fetchProfile(userId);
      const profilePatch: { bio?: string | null; avatar_url?: string } = {};
      if (bio.trim()) profilePatch.bio = bio.trim().slice(0, BIO_MAX);
      if (avatarUri) profilePatch.avatar_url = await uploadAvatar(userId, avatarUri);
      if (Object.keys(profilePatch).length > 0) {
        await useAuthStore.getState().updateProfile(profilePatch);
      }
      await queryClient.invalidateQueries({ queryKey: ['userEvent'] });
      router.replace(ROUTES.onboardingHowItWorks);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create profile';
      Toast.show({ type: 'error', text1: msg });
    } finally {
      setLoading(false);
    }
  };

  const chooseAvatar = async () => {
    const fromLibrary = async () => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        Toast.show({ type: 'error', text1: 'Photo library permission denied' });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        mediaTypes: ['images'],
      });
      if (!result.canceled && result.assets[0]?.uri) setAvatarUri(result.assets[0].uri);
    };
    const fromCamera = async () => {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.status !== 'granted') {
        Toast.show({ type: 'error', text1: 'Camera permission denied' });
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        mediaTypes: ['images'],
      });
      if (!result.canceled && result.assets[0]?.uri) setAvatarUri(result.assets[0].uri);
    };

    if (Platform.OS === 'web') {
      await fromLibrary();
      return;
    }
    showProfilePhotoDialog(showDialog, () => void fromCamera(), () => void fromLibrary());
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.keyboardView}>
        <AppKeyboardAwareScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Text variant="displayMedium">Set up your profile</Text>
          <Text variant="body" color={colors.textSecondary}>
            Choose your username. Everything else is optional and can be changed later.
          </Text>

          <View style={styles.avatarWrap}>
            <TouchableOpacity
              style={styles.avatarTouchable}
              onPress={() => void chooseAvatar()}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={avatarUri ? 'Change profile photo' : 'Add profile photo'}
            >
              <Avatar
                uri={avatarUri}
                username={username || 'you'}
                size={88}
                fallbackTone="brand"
              />
              <View style={styles.editFab}>
                {loading && avatarUri ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <IconCamera size={16} color={colors.onPrimary} />
                )}
              </View>
            </TouchableOpacity>
            <Text variant="label" color={colors.textSecondary}>
              {avatarUri ? 'Change photo' : 'Add photo (optional)'}
            </Text>
          </View>

          <View style={styles.inputs}>
            <Input
              label="Username"
              placeholder="e.g. john_doe"
              value={username}
              onChangeText={(v) => setUsername(normalizeUsernameInput(v))}
              autoCapitalize="none"
              autoCorrect={false}
              error={
                usernameAvailabilityStatus === 'invalid' ||
                usernameAvailabilityStatus === 'taken' ||
                usernameAvailabilityStatus === 'error'
                  ? usernameAvailabilityError
                  : undefined
              }
              autoFocus
            />
            <Input
              label="Display name (optional)"
              placeholder="e.g. John Doe"
              value={displayName}
              onChangeText={setDisplayName}
            />
            <Input
              label={`Bio (optional) - ${bio.length}/${BIO_MAX}`}
              placeholder="Tell people who you are..."
              value={bio}
              onChangeText={(value) => setBio(value.slice(0, BIO_MAX))}
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.footer}>
            <Button
              onPress={handleCreate}
              loading={loading}
              fullWidth
              size="lg"
              disabled={
                !username.trim() ||
                !usernameOk ||
                usernameAvailabilityStatus === 'checking'
              }
            >
              Continue
            </Button>
          </View>
        </AppKeyboardAwareScrollView>
      </View>
    </SafeAreaView>
  );
}
