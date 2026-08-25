import React, { useCallback, useMemo, useState } from 'react';
import { View, SafeAreaView, TouchableOpacity } from 'react-native';
import { supabase } from '../../lib/supabase';
import { formatAuthError, normalizeEmail } from '../../lib/authErrors';
import {
  validateEmailField,
  validatePasswordField,
  validatePasswordMatch,
  validationMessage,
} from '../../lib/formValidation';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../../components/ui/Text';
import { Input } from '../../components/ui/Input';
import { AppKeyboardAwareScrollView } from '../../components/ui/AppKeyboardAwareScrollView';
import { Button } from '../../components/ui/Button';
import { legalAcceptanceMetadata } from '../../lib/legal';
import { AuthModeBackButton } from '../../components/auth/AuthModeBackButton';
import { AuthLegalLinks } from '../../components/auth/AuthLegalLinks';
import { LegalConsentCheckbox } from '../../components/auth/LegalConsentCheckbox';
import { SignupAgeStep } from '../../components/auth/SignupAgeStep';
import { assessBirthDate } from '../../lib/ageAssurance';
import { InlineFeedback, type InlineFeedbackData } from '../../components/ui/InlineFeedback';
import { useLoginScreenStyles } from '../../components/auth/useLoginScreenStyles';

const MIN_PASSWORD_LENGTH = 6;

export default function LoginScreen() {
  const { colors } = useTheme();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [signupStep, setSignupStep] = useState<'age' | 'credentials'>('age');
  const [birthDate, setBirthDate] = useState('');
  const [birthDateTouched, setBirthDateTouched] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [tosAccepted, setTosAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<InlineFeedbackData | null>(null);
  const styles = useLoginScreenStyles();

  const emailValidation = useMemo(() => validateEmailField(email), [email]);
  const passwordValidation = useMemo(
    () => validatePasswordField(password, MIN_PASSWORD_LENGTH),
    [password],
  );
  const confirmValidation = useMemo(
    () => validatePasswordMatch(password, confirmPassword),
    [password, confirmPassword],
  );
  const birthDateAssessment = useMemo(() => assessBirthDate(birthDate), [birthDate]);

  const showEmailError = email.length > 0 && !emailValidation.ok;
  const showPasswordError = password.length > 0 && !passwordValidation.ok;
  const showConfirmError = mode === 'signUp' && confirmPassword.length > 0 && !confirmValidation.ok;

  const signUpOk =
    emailValidation.ok &&
    passwordValidation.ok &&
    confirmValidation.ok &&
    birthDateAssessment.ok &&
    tosAccepted &&
    privacyAccepted;
  const signInOk = emailValidation.ok && passwordValidation.ok;

  const showSignIn = useCallback(() => {
    setMode('signIn');
    setConfirmPassword('');
    setSignupStep('age');
    setBirthDate('');
    setBirthDateTouched(false);
    setTosAccepted(false);
    setPrivacyAccepted(false);
    setFeedback(null);
  }, []);

  const showSignUp = useCallback(() => {
    setMode('signUp');
    setSignupStep('age');
    setFeedback(null);
  }, []);

  const handleSignUpBack = useCallback(() => {
    if (signupStep === 'credentials') setSignupStep('age');
    else showSignIn();
  }, [showSignIn, signupStep]);

  const handleAgeContinue = useCallback(() => {
    setBirthDateTouched(true);
    if (!birthDateAssessment.ok) {
      return;
    }
    setSignupStep('credentials');
  }, [birthDateAssessment]);

  const handleForgotPassword = async () => {
    setFeedback(null);
    if (!emailValidation.ok) {
      setFeedback({ tone: 'error', message: 'Enter a valid email address above first.' });
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email));
      if (error) throw error;
      setFeedback({
        tone: 'success',
        title: 'Reset email sent',
        message: 'Check your inbox for a password reset link.',
      });
    } catch (err: unknown) {
      setFeedback({
        tone: 'error',
        title: 'Could not send reset email',
        message: formatAuthError(err),
      });
    }
  };

  const handleSubmit = async () => {
    setFeedback(null);
    if (!emailValidation.ok) {
      setFeedback({ tone: 'error', message: emailValidation.message });
      return;
    }
    if (!passwordValidation.ok) {
      setFeedback({ tone: 'error', message: passwordValidation.message });
      return;
    }
    if (mode === 'signUp' && !confirmValidation.ok) {
      setFeedback({ tone: 'error', message: confirmValidation.message });
      return;
    }
    if (mode === 'signUp' && !birthDateAssessment.ok) {
      setSignupStep('age');
      return;
    }
    if (mode === 'signUp' && (!tosAccepted || !privacyAccepted)) {
      setFeedback({
        tone: 'error',
        message: 'Accept both the Terms of Use and Privacy Policy to create your account.',
      });
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
          options: {
            data: {
              ...legalAcceptanceMetadata(acceptedAt),
              birth_date: birthDateAssessment.ok ? birthDateAssessment.isoDate : null,
            },
          },
        });
        if (error) throw error;

        if (!data.session) {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password,
          });
          if (signInError) {
            setFeedback({
              tone: 'info',
              title: 'Check your email',
              message: 'Confirm your account, then sign in.',
            });
            return;
          }
        }
      }
      // Session + navigation are handled by onAuthStateChange and Stack.Protected guards.
    } catch (err: unknown) {
      setFeedback({
        tone: 'error',
        title: mode === 'signIn' ? 'Sign in failed' : 'Could not create account',
        message: formatAuthError(err),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.keyboardView}>
        <View style={styles.header}>
          <AuthModeBackButton mode={mode} onReturnToSignIn={handleSignUpBack} />
        </View>

        <AppKeyboardAwareScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {mode === 'signUp' && signupStep === 'age' ? (
            <SignupAgeStep
              value={birthDate}
              onChange={setBirthDate}
              onBlur={() => setBirthDateTouched(true)}
              error={
                birthDateTouched && !birthDateAssessment.ok
                  ? birthDateAssessment.message
                  : undefined
              }
            />
          ) : (
            <>
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
                  onChangeText={(value) => {
                    setEmail(value);
                    setFeedback(null);
                  }}
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
                  onChangeText={(value) => {
                    setPassword(value);
                    setFeedback(null);
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete={mode === 'signUp' ? 'password-new' : 'password'}
                  textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
                  error={showPasswordError ? validationMessage(passwordValidation) : undefined}
                  hint={password.length === 0 ? `At least ${MIN_PASSWORD_LENGTH} characters` : undefined}
                />
                {mode === 'signUp' ? (
                  <>
                    <Input
                      label="Confirm password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChangeText={(value) => {
                        setConfirmPassword(value);
                        setFeedback(null);
                      }}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="password-new"
                      textContentType="newPassword"
                      error={showConfirmError ? validationMessage(confirmValidation) : undefined}
                      success={confirmValidation.ok && confirmPassword.length > 0 ? 'Passwords match' : undefined}
                    />
                    <View style={styles.consents}>
                      <LegalConsentCheckbox
                        checked={tosAccepted}
                        onChange={setTosAccepted}
                        document="terms"
                      />
                      <LegalConsentCheckbox
                        checked={privacyAccepted}
                        onChange={setPrivacyAccepted}
                        document="privacy"
                      />
                    </View>
                  </>
                ) : null}
              </View>
            </>
          )}

          {mode === 'signIn' ? (
            <>
              <TouchableOpacity
                onPress={handleForgotPassword}
                style={styles.switchMode}
                accessibilityRole="button"
                accessibilityLabel="Forgot password"
              >
                <Text variant="body" color={colors.link}>
                  Forgot password?
                </Text>
              </TouchableOpacity>
              <View style={styles.switchMode}>
                <AuthLegalLinks prefix="By signing in you agree to our" />
              </View>
            </>
          ) : null}

          <TouchableOpacity
            onPress={() => {
              if (mode === 'signIn') showSignUp();
              else showSignIn();
            }}
            style={styles.switchMode}
            accessibilityRole="button"
            accessibilityLabel={mode === 'signIn' ? 'Sign up' : 'Sign in'}
          >
            <Text variant="body" color={colors.textSecondary}>
              {mode === 'signIn' ? 'Need an account? ' : 'Already have an account? '}
              <Text variant="body" color={colors.link}>
                {mode === 'signIn' ? 'Sign up' : 'Sign in'}
              </Text>
            </Text>
          </TouchableOpacity>
          {feedback ? <InlineFeedback {...feedback} testID="auth-inline-feedback" /> : null}
          <View style={styles.footer}>
            <Button
              onPress={mode === 'signUp' && signupStep === 'age' ? handleAgeContinue : handleSubmit}
              loading={loading}
              fullWidth
              size="lg"
              disabled={
                mode === 'signIn'
                  ? !signInOk
                  : signupStep === 'age'
                    ? !birthDateAssessment.ok
                    : !signUpOk
              }
            >
              {mode === 'signIn'
                ? 'Sign in'
                : signupStep === 'age'
                  ? 'Continue'
                  : 'Create account'}
            </Button>
          </View>
        </AppKeyboardAwareScrollView>
      </View>
    </SafeAreaView>
  );
}
