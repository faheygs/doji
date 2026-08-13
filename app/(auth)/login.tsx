import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
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
import { AppKeyboardAwareScrollView } from '../../components/ui/AppKeyboardAwareScrollView';
import { Button } from '../../components/ui/Button';
import { legalAcceptanceMetadata } from '../../lib/legal';
import { AuthModeBackButton } from '../../components/auth/AuthModeBackButton';

const MIN_PASSWORD_LENGTH = 6;

export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [tosAccepted, setTosAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
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
          paddingTop: Spacing.md,
          paddingBottom: Spacing.xl,
          width: '100%',
        },
        tosRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
          marginTop: Spacing.xs,
        },
        tosCheckbox: {
          width: 22,
          height: 22,
          borderRadius: 6,
          borderWidth: 2,
          alignItems: 'center',
          justifyContent: 'center',
        },
      }),
    [colors.background],
  );

  const emailValidation = useMemo(() => validateEmailField(email), [email]);
  const passwordValidation = useMemo(
    () => validatePasswordField(password, MIN_PASSWORD_LENGTH),
    [password],
  );
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
    confirmValidation.ok &&
    tosAccepted &&
    privacyAccepted;
  const signInOk = emailValidation.ok && passwordValidation.ok;

  const showSignIn = useCallback(() => {
    setMode('signIn');
    setConfirmPassword('');
    setTosAccepted(false);
    setPrivacyAccepted(false);
  }, []);

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
      Toast.show({
        type: 'error',
        text1: 'Could not send reset email',
        text2: formatAuthError(err),
      });
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
        const acceptedAt = new Date().toISOString();
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { data: legalAcceptanceMetadata(acceptedAt) },
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
      <View style={styles.keyboardView}>
        <View style={styles.header}>
          <AuthModeBackButton mode={mode} onReturnToSignIn={showSignIn} />
        </View>

        <AppKeyboardAwareScrollView
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
              hint={
                password.length === 0 ? `At least ${MIN_PASSWORD_LENGTH} characters` : undefined
              }
            />
            {mode === 'signUp' ? (
              <>
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
                    confirmValidation.ok && confirmPassword.length > 0
                      ? 'Passwords match'
                      : undefined
                  }
                />
                <TouchableOpacity
                  onPress={() => setTosAccepted((v) => !v)}
                  style={styles.tosRow}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: tosAccepted }}
                >
                  <View
                    style={[
                      styles.tosCheckbox,
                      {
                        borderColor: tosAccepted ? colors.primary : colors.border,
                        backgroundColor: tosAccepted ? colors.primary : 'transparent',
                      },
                    ]}
                  >
                    {tosAccepted ? (
                      <Text variant="micro" style={{ color: colors.onPrimary, fontWeight: '700' }}>
                        ✓
                      </Text>
                    ) : null}
                  </View>
                  <Text variant="bodySmall" color={colors.textSecondary} style={{ flex: 1 }}>
                    I agree to the{' '}
                    <Text
                      variant="bodySmall"
                      color={colors.link}
                      onPress={() => router.push('/(auth)/terms')}
                    >
                      Terms of Use
                    </Text>
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setPrivacyAccepted((v) => !v)}
                  style={styles.tosRow}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityLabel="Agree to the Privacy Policy"
                  accessibilityState={{ checked: privacyAccepted }}
                >
                  <View
                    style={[
                      styles.tosCheckbox,
                      {
                        borderColor: privacyAccepted ? colors.primary : colors.border,
                        backgroundColor: privacyAccepted ? colors.primary : 'transparent',
                      },
                    ]}
                  >
                    {privacyAccepted ? (
                      <Text variant="micro" style={{ color: colors.onPrimary, fontWeight: '700' }}>
                        ✓
                      </Text>
                    ) : null}
                  </View>
                  <Text variant="bodySmall" color={colors.textSecondary} style={{ flex: 1 }}>
                    I have read and agree to the{' '}
                    <Text
                      variant="bodySmall"
                      color={colors.link}
                      onPress={() => router.push('/(auth)/privacy')}
                    >
                      Privacy Policy
                    </Text>
                  </Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>

          {mode === 'signIn' ? (
            <>
              <TouchableOpacity onPress={handleForgotPassword} style={styles.switchMode}>
                <Text variant="body" color={colors.link}>
                  Forgot password?
                </Text>
              </TouchableOpacity>
              <Text variant="bodySmall" color={colors.textTertiary} style={styles.switchMode}>
                By signing in you agree to our{' '}
                <Text
                  variant="bodySmall"
                  color={colors.link}
                  onPress={() => router.push('/(auth)/terms')}
                >
                  Terms of Use
                </Text>
              </Text>
            </>
          ) : null}

          <TouchableOpacity
            onPress={() => {
              if (mode === 'signIn') setMode('signUp');
              else showSignIn();
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
        </AppKeyboardAwareScrollView>
      </View>
    </SafeAreaView>
  );
}
