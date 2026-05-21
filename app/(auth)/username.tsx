import React, { useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/useAuthStore';
import { Spacing, DEFAULT_APP_THEME } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../../components/ui/Text';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { IconProfile } from '../../components/icons/Icons';
import { useUsernameAvailability, normalizeUsernameInput } from '../../hooks/useUsernameAvailability';

export default function UsernameScreen() {
  const { session, fetchProfile } = useAuthStore();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
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
        footer: {
          marginTop: 'auto' as any,
          paddingTop: Spacing.xl,
        },
      }),
    [colors.background],
  );

  const handleCreate = async () => {
    if (!usernameOk || usernameAvailabilityStatus === 'checking') return;
    if (!displayName.trim()) {
      Toast.show({ type: 'error', text1: 'Enter your display name' });
      return;
    }

    const userId = session?.user?.id;
    if (!userId) return;

    const handle = normalizeUsernameInput(username);

    setLoading(true);
    try {
      const { error } = await supabase.from('profiles').insert({
        id: userId,
        username: handle,
        display_name: displayName.trim(),
        avatar_url: null,
        avatar_gradient: [colors.xpGradientStart, colors.xpGradientEnd],
        bio: null,
        notification_token: null,
        app_theme: DEFAULT_APP_THEME,
        current_streak: 0,
        longest_streak: 0,
        total_completions: 0,
        total_missed: 0,
        xp: 0,
        level: 1,
        reactions_received: 0,
        streak_shields: 0,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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
      await queryClient.invalidateQueries({ queryKey: ['userEvent'] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create profile';
      Toast.show({ type: 'error', text1: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <IconProfile size={48} color={colors.textSecondary} />
          <Text variant="displayMedium">Set up your profile</Text>
          <Text variant="body" color={colors.textSecondary}>
            Choose a username and display name to get started.
          </Text>

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
              label="Display name"
              placeholder="e.g. John Doe"
              value={displayName}
              onChangeText={setDisplayName}
            />
          </View>

          <View style={styles.footer}>
            <Button
              onPress={handleCreate}
              loading={loading}
              fullWidth
              size="lg"
              disabled={
                !displayName.trim() ||
                !username.trim() ||
                !usernameOk ||
                usernameAvailabilityStatus === 'checking'
              }
            >
              Continue
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
