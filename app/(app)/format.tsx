import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../../components/ui/Text';
import { Input } from '../../components/ui/Input';
import { IconClose } from '../../components/icons/Icons';
import { useUserEvent, useCreatePost } from '../../hooks/useUserEvent';
import { backOrHome, navigateToFeedAfterChallengeComplete } from '../../lib/navigationReturn';
import { canSubmitChallenge } from '../../lib/participationGate';
import { formatRuleHint, parseAnswerRule, validateAnswerRule } from '../../lib/answerRules';

export default function FormatScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: userEvent, isLoading } = useUserEvent();
  const createPost = useCreatePost();
  const [answer, setAnswer] = useState('');

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
    const check = validateAnswerRule(answer, answerRule);
    if (!check.ok) {
      Toast.show({ type: 'error', text1: check.message });
      return;
    }
    if (!canSubmitChallenge(userEvent)) {
      Toast.show({ type: 'error', text1: "Time's up!", text2: "You missed today's window." });
      navigateToFeedAfterChallengeComplete(router);
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
          Toast.show({ type: 'error', text1: err.message ?? 'Failed to submit' });
        },
      },
    );
  }, [userEvent, answer, answerRule, createPost, router]);

  const canSubmit =
    Boolean(answer.trim()) &&
    Boolean(answerRule) &&
    validation?.ok === true &&
    !createPost.isPending;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        header: {
          flexDirection: 'row',
          justifyContent: 'flex-end',
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.sm,
        },
        scroll: { flexGrow: 1, paddingBottom: Spacing.lg },
        content: {
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.xl,
          gap: Spacing.lg,
        },
        title: { textAlign: 'center' },
        ruleBanner: {
          borderRadius: Radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: `${colors.primary}55`,
          backgroundColor: `${colors.primary}12`,
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.sm,
        },
        inputWrap: { minHeight: 120 },
        validationOk: { color: colors.success },
        validationErr: { color: colors.error },
        footer: { padding: Spacing.lg },
        submitButton: {
          width: '100%',
          height: 52,
          borderRadius: Radius.md,
          alignItems: 'center',
          justifyContent: 'center',
        },
      }),
    [colors],
  );

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
          <TouchableOpacity onPress={() => backOrHome(router)} hitSlop={16} style={{ padding: Spacing.sm }}>
            <IconClose size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', padding: Spacing.xl }}>
          <Text variant="body" color={colors.textSecondary} style={{ textAlign: 'center', lineHeight: 22 }}>
            This format challenge is missing answer rules. Try again later.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => backOrHome(router)} hitSlop={16} style={{ padding: Spacing.sm }}>
            <IconClose size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
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
              <Text variant="micro" color={colors.primary} style={{ fontWeight: '700', letterSpacing: 0.5 }}>
                FORMAT RULE
              </Text>
              <Text variant="bodySmall" color={colors.text} style={{ marginTop: 4, lineHeight: 20 }}>
                {ruleHint}
              </Text>
            </View>

            <View style={styles.inputWrap}>
              <Input
                placeholder="Type your answer…"
                value={answer}
                onChangeText={setAnswer}
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
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!canSubmit}
            activeOpacity={0.85}
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
