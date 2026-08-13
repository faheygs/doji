import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, SafeAreaView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../../components/ui/Text';
import { Input } from '../../components/ui/Input';
import { AppKeyboardAwareScrollView } from '../../components/ui/AppKeyboardAwareScrollView';
import { IconClose } from '../../components/icons/Icons';
import { useUserEvent, useCreatePost } from '../../hooks/useUserEvent';
import { backOrHome, navigateToFeedAfterChallengeComplete } from '../../lib/navigationReturn';
import { required, validationMessage } from '../../lib/formValidation';
import { ErrorState } from '../../components/ui/ErrorState';
import { dojiSubmissionErrorCopy } from '../../lib/dojiSubmissionError';
import { ChallengeTimer } from '../../components/challenge/ChallengeTimer';

export default function TaskScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: userEvent, isLoading, isError, refetch } = useUserEvent();
  const createPost = useCreatePost();
  const [answer, setAnswer] = useState('');

  const challenge = userEvent?.challenge;
  const answerValidation = useMemo(() => required(answer, 'Enter an answer.'), [answer]);
  const canSubmit = answerValidation.ok && !createPost.isPending;

  useEffect(() => {
    if (isLoading) return;
    if (!userEvent) return;
    const t = userEvent.challenge?.type;
    if (t && t !== 'task') {
      router.replace('/(app)/challenge');
    }
  }, [isLoading, userEvent, router]);

  const handleSubmit = useCallback(async () => {
    if (!userEvent || !answer.trim()) return;
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
          Toast.show({ type: 'error', text1: copy.title, text2: copy.message });
        },
      },
    );
  }, [userEvent, answer, createPost, router]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.sm,
        },
        scroll: { flexGrow: 1 },
        content: {
          flex: 1,
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.xl,
          gap: Spacing.lg,
        },
        title: { textAlign: 'center' },
        inputWrap: { flex: 1, minHeight: 120 },
        footer: { width: '100%', paddingVertical: Spacing.lg },
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

  if (isError) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorState
          title="Couldn't load challenge"
          message="Check your connection and try again."
          onRetry={() => void refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={{ flex: 1 }}>
        <View style={styles.header}>
          <ChallengeTimer expiresAt={userEvent?.expires_at} onExpire={() => void refetch()} />
          <TouchableOpacity
            onPress={() => backOrHome(router)}
            hitSlop={16}
            style={{ padding: Spacing.sm }}
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
              {challenge?.title ?? 'Challenge'}
            </Text>

            {challenge?.description ? (
              <Text variant="body" color={colors.textSecondary} style={{ textAlign: 'center' }}>
                {challenge.description}
              </Text>
            ) : null}

            <View style={styles.inputWrap}>
              <Input
                placeholder="Type your answer..."
                value={answer}
                onChangeText={setAnswer}
                multiline
                autoFocus
                containerStyle={{ flex: 1 }}
                hint={answer.trim().length === 0 ? 'Your answer is required' : undefined}
                error={answer.length > 0 ? validationMessage(answerValidation) : undefined}
              />
            </View>
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
          </View>
        </AppKeyboardAwareScrollView>
      </View>
    </SafeAreaView>
  );
}
