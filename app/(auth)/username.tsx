import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, TouchableOpacity, View, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { executeCommand } from '../../lib/commandGateway';
import { useAuthStore } from '../../stores/useAuthStore';
import { ROUTES } from '../../lib/routes';
import { DEFAULT_APP_THEME } from '../../constants/theme';
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
import { assessBirthDate, assessIsoBirthDate } from '../../lib/ageAssurance';
import { useProfilePhotoPicker } from '../../hooks/useProfilePhotoPicker';
import { LegacyAgeFallbackInput } from '../../components/auth/LegacyAgeFallbackInput';
import { InlineFeedback } from '../../components/ui/InlineFeedback';
import { createProfileSetupStyles } from '../../components/auth/profileSetupStyles';

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
  const [submitError, setSubmitError] = useState('');
  const [usernameSubmitError, setUsernameSubmitError] = useState('');
  const [displayNameError, setDisplayNameError] = useState('');
  const [bioError, setBioError] = useState('');
  const onAvatarSelected = useCallback((uri: string) => setAvatarUri(uri), []);
  const chooseAvatar = useProfilePhotoPicker(onAvatarSelected, setSubmitError);

  const {
    errorMessage: usernameAvailabilityError,
    isOkForSubmit: usernameOk,
    status: usernameAvailabilityStatus,
  } = useUsernameAvailability(username, { ownUserId: session?.user?.id });
  const signupBirthDateAssessment = useMemo(
    () => assessIsoBirthDate(session?.user?.user_metadata?.birth_date),
    [session?.user?.user_metadata?.birth_date],
  );
  const fallbackBirthDateAssessment = useMemo(() => assessBirthDate(birthDate), [birthDate]);
  const needsLegacyAgeFallback = !signupBirthDateAssessment.ok;
  const birthDateAssessment = signupBirthDateAssessment.ok
    ? signupBirthDateAssessment
    : fallbackBirthDateAssessment;

  const styles = useMemo(() => createProfileSetupStyles(colors), [colors]);

  const handleCreate = async () => {
    if (!usernameOk || usernameAvailabilityStatus === 'checking') return;
    const userId = session?.user?.id;
    if (!userId) return;
    setBirthDateTouched(true);
    if (!birthDateAssessment.ok) {
      return;
    }

    const handle = normalizeUsernameInput(username);
    setSubmitError('');
    setUsernameSubmitError('');
    setDisplayNameError('');
    setBioError('');
    const displayNameCheck = filterContent(displayName);
    if (!displayNameCheck.ok) {
      setDisplayNameError(displayNameCheck.reason);
      return;
    }
    const bioCheck = filterContent(bio);
    if (!bioCheck.ok) {
      setBioError(bioCheck.reason);
      return;
    }

    setLoading(true);
    let uploadedAvatarUrl: string | null = null;
    try {
      if (avatarUri) uploadedAvatarUrl = await uploadAvatar(userId, avatarUri);

      const { data: createdProfile, error } = await executeCommand('create_own_profile', {
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
          setUsernameSubmitError('That username was just taken. Pick another.');
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

      await supabase.auth.refreshSession();
      await fetchProfile(userId);
      await queryClient.invalidateQueries({ queryKey: ['userEvent'] });
      router.replace(ROUTES.onboardingHowItWorks);
    } catch (err: unknown) {
      if (uploadedAvatarUrl) void removePublicStorageObject('avatars', uploadedAvatarUrl);
      const msg = err instanceof Error ? err.message : 'Failed to create profile';
      setSubmitError(msg);
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
            Add the details people will recognize. Only your username is required.
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
            {needsLegacyAgeFallback ? (
              <LegacyAgeFallbackInput
                value={birthDate}
                onChange={setBirthDate}
                onBlur={() => setBirthDateTouched(true)}
                error={
                  birthDateTouched && !birthDateAssessment.ok
                    ? birthDateAssessment.message
                    : undefined
                }
              />
            ) : null}
            <Input
              label="Username"
              placeholder="e.g. john_doe"
              value={username}
              onChangeText={(v) => {
                setUsername(normalizeUsernameInput(v));
                setUsernameSubmitError('');
                setSubmitError('');
              }}
              autoCapitalize="none"
              autoCorrect={false}
              error={
                usernameAvailabilityStatus === 'invalid' ||
                usernameAvailabilityStatus === 'taken' ||
                usernameAvailabilityStatus === 'error'
                  ? usernameAvailabilityError
                  : usernameSubmitError || undefined
              }
            />
            <Input
              label="Display name (optional)"
              placeholder="e.g. John Doe"
              value={displayName}
              onChangeText={(value) => {
                setDisplayName(value);
                setDisplayNameError('');
                setSubmitError('');
              }}
              error={displayNameError || undefined}
            />
            <Input
              label={`Bio (optional) - ${bio.length}/${BIO_MAX}`}
              placeholder="Tell people who you are..."
              value={bio}
              onChangeText={(value) => {
                setBio(value.slice(0, BIO_MAX));
                setBioError('');
                setSubmitError('');
              }}
              multiline
              numberOfLines={3}
              error={bioError || undefined}
            />
          </View>

          {submitError ? <InlineFeedback message={submitError} testID="profile-setup-error" /> : null}

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
