import React, { useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { supabase } from '../../lib/supabase';
import { formatAuthError, isValidEmail, normalizeEmail } from '../../lib/authErrors';
import { Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../../components/ui/Text';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { IconChevronLeft } from '../../components/icons/Icons';

const MIN_PASSWORD_LENGTH = 6;

export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

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
        header: {
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.md,
        },
        scrollContent: {
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.xl,
          paddingBottom: Spacing.md,
          gap: Spacing.lg,
        },
        inputs: {
          gap: Spacing.md,
          marginTop: Spacing.sm,
        },
        switchMode: {
          alignSelf: 'flex-start',
          marginTop: Spacing.sm,
        },
        footer: {
          padding: Spacing.lg,
          paddingTop: Spacing.md,
        },
      }),
    [colors.background],
  );

  const emailOk = isValidEmail(email);
  const passwordOk = password.length >= MIN_PASSWORD_LENGTH;
  const signUpOk =
    emailOk &&
    passwordOk &&
    confirmPassword === password &&
    confirmPassword.length >= MIN_PASSWORD_LENGTH;
  const signInOk = emailOk && passwordOk;

  const handleSubmit = async () => {
    if (!emailOk) {
      Toast.show({ type: 'error', text1: 'Enter a valid email address' });
      return;
    }
    if (!passwordOk) {
      Toast.show({
        type: 'error',
        text1: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
      return;
    }
    if (mode === 'signUp' && confirmPassword !== password) {
      Toast.show({ type: 'error', text1: 'Passwords do not match' });
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signIn') {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizeEmail(email),
          password,
        });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: normalizeEmail(email),
          password,
        });
        if (error) throw error;
        if (!data.session) {
          Toast.show({
            type: 'info',
            text1: 'Check your Supabase settings',
            text2:
              'If sign-up did not continue, disable “Confirm email” under Authentication → Providers → Email so users can sign in immediately.',
          });
        }
      }
    } catch (err: unknown) {
      Toast.show({
        type: 'error',
        text1: mode === 'signIn' ? 'Sign in failed' : 'Sign up failed',
        text2: formatAuthError(err),
      });
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
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={16}>
            <IconChevronLeft size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text variant="displayMedium">
            {mode === 'signIn' ? 'Welcome back' : 'Create an account'}
          </Text>
          <Text variant="body" color={colors.textSecondary}>
            {mode === 'signIn'
              ? 'Sign in with your email and password.'
              : 'Pick an email and password to get started.'}
          </Text>

          <View style={styles.inputs}>
            <Input
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              autoFocus
            />
            <Input
              label="Password"
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={mode === 'signUp' ? 'password-new' : 'password'}
              textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
            />
            {mode === 'signUp' ? (
              <Input
                label="Confirm password"
                placeholder="••••••••"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password-new"
                textContentType="newPassword"
              />
            ) : null}
          </View>

          <TouchableOpacity
            onPress={() => {
              setMode(mode === 'signIn' ? 'signUp' : 'signIn');
              setConfirmPassword('');
            }}
            style={styles.switchMode}
          >
            <Text variant="body" color={colors.textSecondary}>
              {mode === 'signIn' ? 'Need an account? ' : 'Already have an account? '}
              <Text variant="body" color={colors.link}>
                {mode === 'signIn' ? 'Sign up' : 'Sign in'}
              </Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.footer}>
          <Button
            onPress={handleSubmit}
            loading={loading}
            fullWidth
            size="lg"
            disabled={mode === 'signIn' ? !signInOk : !signUpOk}
          >
            {mode === 'signIn' ? 'Sign in' : 'Create account'}
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
