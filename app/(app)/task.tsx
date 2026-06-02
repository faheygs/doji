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
import { XpGainOverlay } from '../../components/gamification/XpGainOverlay';
import { useChallengeCompleteOverlay } from '../../hooks/useChallengeCompleteOverlay';
import { buildXpOverlayPayload } from '../../lib/challengeComplete';
import { required, validationMessage } from '../../lib/formValidation';

export default function TaskScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: userEvent, isLoading } = useUserEvent();
  const createPost = useCreatePost();
  const [answer, setAnswer] = useState('');
  const { xpOverlay, setXpOverlay, dismissToFeed } = useChallengeCompleteOverlay();

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
          setXpOverlay(
            buildXpOverlayPayload('task', challenge?.xp_reward, {
              fromBuyIn: userEvent?.status === 'buy_in_open',
            }),
          );
        },
        onError: (err: Error) => {
          Toast.show({ type: 'error', text1: err.message ?? 'Failed to submit' });
        },
      },
    );
  }, [userEvent, answer, createPost, router, challenge?.xp_reward]);

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
        scroll: { flexGrow: 1 },
        content: {
          flex: 1,
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.xl,
          gap: Spacing.lg,
        },
        title: { textAlign: 'center' },
        inputWrap: { flex: 1, minHeight: 120 },
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

  return (
    <SafeAreaView style={styles.container}>
      {xpOverlay ? (
        <XpGainOverlay
          amount={xpOverlay.amount}
          sparks={xpOverlay.sparks}
          xp={xpOverlay.xp}
          level={xpOverlay.level}
          dismissLabel="Back to Feed"
          onComplete={dismissToFeed}
        />
      ) : null}
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
