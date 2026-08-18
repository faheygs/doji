import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { removePublicStorageObject, uploadAvatar } from '../../utils/upload';
import { filterContent } from '../../lib/contentFilter';
import { assessBirthDate, formatBirthDateInput } from '../../lib/ageAssurance';
import { useProfilePhotoPicker } from '../../hooks/useProfilePhotoPicker';

const BIO_MAX = 150;

export default function UsernameScreen() {
  const router = useRouter();
  const { session, fetchProfile } = useAuthStore();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [birthDateTouched, setBirthDateTouched] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const onAvatarSelected = useCallback((uri: string) => setAvatarUri(uri), []);
  const chooseAvatar = useProfilePhotoPicker(onAvatarSelected);

  const {
    errorMessage: usernameAvailabilityError,
    isOkForSubmit: usernameOk,
    status: usernameAvailabilityStatus,
  } = useUsernameAvailability(username, { ownUserId: session?.user?.id });
  const birthDateAssessment = useMemo(() => assessBirthDate(birthDate), [birthDate]);

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
    [colors.background, colors.primary],
  );

  const handleCreate = async () => {
    if (!usernameOk || usernameAvailabilityStatus === 'checking') return;
    const userId = session?.user?.id;
    if (!userId) return;
    setBirthDateTouched(true);
    if (!birthDateAssessment.ok) {
      Toast.show({ type: 'error', text1: birthDateAssessment.message });
      return;
    }

    const handle = normalizeUsernameInput(username);
    const optionalText = [displayName, bio].map(filterContent).find((result) => !result.ok);
    if (optionalText && !optionalText.ok) {
      Toast.show({ type: 'error', text1: optionalText.reason });
      return;
    }

    setLoading(true);
    let uploadedAvatarUrl: string | null = null;
    try {
      if (avatarUri) uploadedAvatarUrl = await uploadAvatar(userId, avatarUri);

      const { data: createdProfile, error } = await supabase.rpc('create_own_profile', {
        p_username: handle,
        p_display_name: displayName.trim() || handle,
        p_avatar_gradient: [colors.xpGradientStart, colors.xpGradientEnd],
        p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        p_app_theme: DEFAULT_APP_THEME,
        p_birth_date: birthDateAssessment.isoDate,
        p_bio: bio.trim().slice(0, BIO_MAX) || null,
        p_avatar_url: uploadedAvatarUrl,
      });

      if (error) {
        if (uploadedAvatarUrl) {
          void removePublicStorageObject('avatars', uploadedAvatarUrl);
          uploadedAvatarUrl = null;
        }
        if (error.code === '23505') {
          // Race: hook may have missed a concurrent signup
          Toast.show({ type: 'error', text1: 'That username was just taken. Pick another.' });
        } else {
          throw error;
        }
        return;
      }

      // If an already-created profile won an auth/navigation race, the command
      // returns that authoritative row. Do not leave a newly uploaded orphan.
      if (uploadedAvatarUrl && createdProfile?.avatar_url !== uploadedAvatarUrl) {
        void removePublicStorageObject('avatars', uploadedAvatarUrl);
        uploadedAvatarUrl = null;
      }

      await fetchProfile(userId);
      await queryClient.invalidateQueries({ queryKey: ['userEvent'] });
      router.replace(ROUTES.onboardingHowItWorks);
    } catch (err: unknown) {
      if (uploadedAvatarUrl) void removePublicStorageObject('avatars', uploadedAvatarUrl);
      const msg = err instanceof Error ? err.message : 'Failed to create profile';
      Toast.show({ type: 'error', text1: msg });
    } finally {
      setLoading(false);
    }
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
            Confirm your age and choose a username. Your birthday stays private and is
            not saved after we verify you are 13 or older.
          </Text>

          <View style={styles.avatarWrap}>
            <TouchableOpacity
              style={styles.avatarTouchable}
              onPress={chooseAvatar}
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
              label="Date of birth"
              placeholder="MM/DD/YYYY"
              value={birthDate}
              onChangeText={(value) => setBirthDate(formatBirthDateInput(value))}
              onBlur={() => setBirthDateTouched(true)}
              keyboardType="number-pad"
              autoComplete="birthdate-full"
              textContentType="none"
              maxLength={10}
              hint="Required for age verification. This is not shown on your profile."
              error={
                birthDateTouched && !birthDateAssessment.ok
                  ? birthDateAssessment.message
                  : undefined
              }
            />
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
                !birthDateAssessment.ok ||
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
