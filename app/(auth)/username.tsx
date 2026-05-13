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
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/useAuthStore';
import { Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../../components/ui/Text';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { IconProfile } from '../../components/icons/Icons';

export default function UsernameScreen() {
  const { session, fetchProfile } = useAuthStore();
  const { colors } = useTheme();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [usernameError, setUsernameError] = useState('');

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

  const validateUsername = (val: string): boolean => {
    if (val.length < 3) {
      setUsernameError('Username must be at least 3 characters');
      return false;
    }
    if (!/^[a-z0-9_]+$/.test(val)) {
      setUsernameError('Only lowercase letters, numbers, and underscores');
      return false;
    }
    setUsernameError('');
    return true;
  };

  const handleCreate = async () => {
    if (!validateUsername(username)) return;
    if (!displayName.trim()) {
      Toast.show({ type: 'error', text1: 'Enter your display name' });
      return;
    }

    const userId = session?.user.id;
    if (!userId) return;

    setLoading(true);
    try {
      const { error } = await supabase.from('profiles').insert({
        id: userId,
        username: username.toLowerCase().trim(),
        display_name: displayName.trim(),
        avatar_url: null,
        avatar_gradient: ['#F97316', '#8B5CF6'],
        bio: null,
        notification_token: null,
        current_streak: 0,
        longest_streak: 0,
        total_completions: 0,
        total_missed: 0,
        xp: 0,
        level: 1,
        reactions_received: 0,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      if (error) {
        if (error.code === '23505') {
          setUsernameError('Username is taken');
        } else {
          throw error;
        }
        return;
      }

      await fetchProfile(userId);
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
              onChangeText={(v) => {
                setUsername(v.toLowerCase());
                if (v.length >= 3) validateUsername(v.toLowerCase());
              }}
              autoCapitalize="none"
              autoCorrect={false}
              error={usernameError}
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
              disabled={username.length < 3 || !displayName.trim()}
            >
              Continue
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
