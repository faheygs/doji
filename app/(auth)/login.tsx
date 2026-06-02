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
import { formatAuthError, normalizeEmail } from '../../lib/authErrors';
import {
  validateEmailField,
  validatePasswordField,
  validatePasswordMatch,
  validationMessage,
} from '../../lib/formValidation';
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

  const emailValidation = useMemo(() => validateEmailField(email), [email]);
  const passwordValidation = useMemo(() => validatePasswordField(password, MIN_PASSWORD_LENGTH), [password]);
  const confirmValidation = useMemo(
    () => validatePasswordMatch(password, confirmPassword),
    [password, confirmPassword],
  );

  const showEmailError = email.length > 0 && !emailValidation.ok;
  const showPasswordError = password.length > 0 && !passwordValidation.ok;
  const showConfirmError = mode === 'signUp' && confirmPassword.length > 0 && !confirmValidation.ok;

  const signUpOk =
    emailValidation.ok &&
    passwordValidation.ok &&
    confirmValidation.ok;
  const signInOk = emailValidation.ok && passwordValidation.ok;

  const handleForgotPassword = async () => {
    if (!emailValidation.ok) {
      Toast.show({ type: 'error', text1: 'Enter your email above first' });
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email));
      if (error) throw error;
      Toast.show({
        type: 'success',
        text1: 'Reset email sent',
        text2: 'Check your inbox for a password reset link.',
      });
    } catch (err: unknown) {
      Toast.show({ type: 'error', text1: 'Could not send reset email', text2: formatAuthError(err) });
    }
  };

  const handleSubmit = async () => {
    if (!emailValidation.ok) {
      Toast.show({ type: 'error', text1: emailValidation.message });
      return;
    }
    if (!passwordValidation.ok) {
      Toast.show({ type: 'error', text1: passwordValidation.message });
      return;
    }
    if (mode === 'signUp' && !confirmValidation.ok) {
      Toast.show({ type: 'error', text1: confirmValidation.message });
      return;
    }

    setLoading(true);
    try {
      const normalizedEmail = normalizeEmail(email);

      if (mode === 'signIn') {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
        });
        if (error) throw error;

        if (!data.session) {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password,
          });
          if (signInError) {
            Toast.show({
              type: 'info',
              text1: 'Check your email',
              text2: 'Confirm your account, then sign in.',
            });
            return;
          }
        }
      }
      // Session + navigation are handled by onAuthStateChange and Stack.Protected guards.
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
              error={showEmailError ? validationMessage(emailValidation) : undefined}
              success={emailValidation.ok && email.length > 0 ? 'Looks good' : undefined}
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
              error={showPasswordError ? validationMessage(passwordValidation) : undefined}
              hint={password.length === 0 ? `At least ${MIN_PASSWORD_LENGTH} characters` : undefined}
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
                error={showConfirmError ? validationMessage(confirmValidation) : undefined}
                success={
                  confirmValidation.ok && confirmPassword.length > 0 ? 'Passwords match' : undefined
                }
              />
            ) : null}
          </View>

          {mode === 'signIn' ? (
            <TouchableOpacity onPress={handleForgotPassword} style={styles.switchMode}>
              <Text variant="body" color={colors.link}>
                Forgot password?
              </Text>
            </TouchableOpacity>
          ) : null}

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
