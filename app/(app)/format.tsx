import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { View, SafeAreaView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../../components/ui/Text';
import { Input } from '../../components/ui/Input';
import { AppKeyboardAwareScrollView } from '../../components/ui/AppKeyboardAwareScrollView';
import { IconClose } from '../../components/icons/Icons';
import { useUserEvent, useCreatePost } from '../../hooks/useUserEvent';
import { backOrHome, navigateToFeedAfterChallengeComplete } from '../../lib/navigationReturn';
import { formatRuleHint, parseAnswerRule, validateAnswerRule } from '../../lib/answerRules';
import { dojiSubmissionErrorCopy } from '../../lib/dojiSubmissionError';
import { ChallengeTimer } from '../../components/challenge/ChallengeTimer';
import { InlineFeedback } from '../../components/ui/InlineFeedback';
import { useFormatScreenStyles } from '../../components/challenge/useFormatScreenStyles';
export default function FormatScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useFormatScreenStyles();
  const { data: userEvent, isLoading, refetch } = useUserEvent();
  const createPost = useCreatePost();
  const [answer, setAnswer] = useState('');
  const [submitError, setSubmitError] = useState<{ title?: string; message: string } | null>(null);
  const challenge = userEvent?.challenge;
  const answerRule = useMemo(
    () => parseAnswerRule(challenge?.answer_rule ?? null),
    [challenge?.answer_rule],
  );
  const ruleHint = answerRule ? formatRuleHint(answerRule) : null;
  const validation = useMemo(() => {
    if (!answerRule || !answer.trim()) return null;
    return validateAnswerRule(answer, answerRule);
  }, [answer, answerRule]);

  useEffect(() => {
    if (isLoading) return;
    if (!userEvent) return;
    const t = userEvent.challenge?.type;
    if (t && t !== 'format') {
      router.replace('/(app)/challenge');
    }
  }, [isLoading, userEvent, router]);

  const handleSubmit = useCallback(async () => {
    if (!userEvent || !answer.trim() || !answerRule) return;
    setSubmitError(null);
    const check = validateAnswerRule(answer, answerRule);
    if (!check.ok) {
      setSubmitError({ message: check.message });
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    createPost.mutate(
      {
        userEventId: userEvent.id,
        photoUri: null,
        frontPhotoUri: null,
        videoUri: null,
        caption: answer.trim(),
        isLate: false,
        postType: 'task_complete',
      },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          navigateToFeedAfterChallengeComplete(router);
        },
        onError: (err: Error) => {
          const copy = dojiSubmissionErrorCopy(err);
          setSubmitError({ title: copy.title, message: copy.message });
        },
      },
    );
  }, [userEvent, answer, answerRule, createPost, router]);

  const canSubmit =
    Boolean(answer.trim()) &&
    Boolean(answerRule) &&
    validation?.ok === true &&
    !createPost.isPending;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={colors.text} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!answerRule) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <ChallengeTimer expiresAt={userEvent?.status === 'buy_in_open' ? null : userEvent?.expires_at} onExpire={() => void refetch()} />
          <TouchableOpacity
            onPress={() => backOrHome(router)}
            hitSlop={16}
            style={{ padding: Spacing.sm }}
            accessibilityRole="button"
            accessibilityLabel="Close challenge"
          >
            <IconClose size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', padding: Spacing.xl }}>
          <Text
            variant="body"
            color={colors.textSecondary}
            style={{ textAlign: 'center', lineHeight: 22 }}
          >
            This format challenge is missing answer rules. Try again later.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={{ flex: 1 }}>
        <View style={styles.header}>
          <ChallengeTimer expiresAt={userEvent?.status === 'buy_in_open' ? null : userEvent?.expires_at} onExpire={() => void refetch()} />
          <TouchableOpacity
            onPress={() => backOrHome(router)}
            hitSlop={16}
            style={{ padding: Spacing.sm }}
            accessibilityRole="button"
            accessibilityLabel="Close challenge"
          >
            <IconClose size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <AppKeyboardAwareScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <Text variant="displayMedium" style={styles.title}>
              {challenge?.title ?? 'Format challenge'}
            </Text>

            {challenge?.description ? (
              <Text variant="body" color={colors.textSecondary} style={{ textAlign: 'center' }}>
                {challenge.description}
              </Text>
            ) : null}

            <View style={styles.ruleBanner}>
              <Text
                variant="micro"
                color={colors.primary}
                style={{ fontWeight: '700', letterSpacing: 0.5 }}
              >
                FORMAT RULE
              </Text>
              <Text
                variant="bodySmall"
                color={colors.text}
                style={{ marginTop: 4, lineHeight: 20 }}
              >
                {ruleHint}
              </Text>
            </View>

            <View style={styles.inputWrap}>
              <Input
                placeholder="Type your answer…"
                value={answer}
                onChangeText={(value) => {
                  setAnswer(value);
                  setSubmitError(null);
                }}
                multiline
                autoFocus
                containerStyle={{ flex: 1 }}
              />
              {validation && !validation.ok ? (
                <View accessibilityLiveRegion="polite">
                  <Text variant="micro" style={styles.validationErr}>
                    {validation.message}
                  </Text>
                </View>
              ) : validation?.ok ? (
                <Text variant="micro" style={styles.validationOk}>
                  Looks good
                </Text>
              ) : null}
            </View>
            {submitError ? <InlineFeedback {...submitError} /> : null}
            <View style={styles.footer}>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={!canSubmit}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Submit answer"
                accessibilityState={{ disabled: !canSubmit, busy: createPost.isPending }}
                style={[
                  styles.submitButton,
                  {
                    backgroundColor: canSubmit ? colors.primary : colors.surfaceMuted,
                  },
                ]}
              >
                {createPost.isPending ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text variant="label" color={canSubmit ? colors.onPrimary : colors.textTertiary}>
                    Submit Answer
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </AppKeyboardAwareScrollView>
      </View>
    </SafeAreaView>
  );
}
