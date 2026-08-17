import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import type { KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../../components/ui/Text';
import { IconClose } from '../../components/icons/Icons';
import { ErrorState } from '../../components/ui/ErrorState';
import { AppTextInput } from '../../components/ui/AppTextInput';
import { AppKeyboardAwareScrollView } from '../../components/ui/AppKeyboardAwareScrollView';
import { useUserEvent } from '../../hooks/useUserEvent';
import { usePollVote } from '../../hooks/usePollVote';
import type { PollOption } from '../../types/database';
import { backOrHome, navigateToFeedAfterChallengeComplete } from '../../lib/navigationReturn';
import { maxLength, required } from '../../lib/formValidation';
import { dojiSubmissionErrorCopy } from '../../lib/dojiSubmissionError';
import { occurrenceCommandId } from '../../lib/idempotency';
import { ChallengeTimer } from '../../components/challenge/ChallengeTimer';
import { isWouldYouRatherChallenge } from '../../lib/challengeDisplay';

export default function PollScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const {
    data: userEvent,
    isLoading: eventLoading,
    isError: eventError,
    refetch: refetchEvent,
  } = useUserEvent();
  const pollVote = usePollVote();
  const [selected, setSelected] = useState<string | null>(null);
  const [otherText, setOtherText] = useState('');
  const scrollRef = useRef<KeyboardAwareScrollViewRef>(null);
  const submitLockRef = useRef(false);

  useEffect(() => {
    if (eventLoading) return;
    if (!userEvent) return;
    const t = userEvent.challenge?.type;
    if (t && t !== 'poll') {
      router.replace('/(app)/challenge');
    }
  }, [eventLoading, userEvent, router]);

  const challenge = userEvent?.challenge;
  const challengeId = challenge?.id;

  const options = (challenge?.poll_options ?? []) as PollOption[];
  const optionsError = !eventLoading && challenge?.type === 'poll' && options.length < 2;

  const isWouldYouRather = isWouldYouRatherChallenge(challenge);
  const visibleOptions = useMemo(
    () => (isWouldYouRather ? options.filter((option) => !option.is_other) : options),
    [isWouldYouRather, options],
  );
  const selectedOption = visibleOptions.find((o) => o.id === selected);
  const isOtherSelected = Boolean(selectedOption?.is_other);

  useEffect(() => {
    if (!isOtherSelected) return;
    const t = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 120);
    return () => clearTimeout(t);
  }, [isOtherSelected]);

  const handleVote = useCallback(async () => {
    if (submitLockRef.current) return;
    if (!selected || !challengeId || !userEvent) return;
    if (isOtherSelected && !otherText.trim()) {
      Toast.show({ type: 'error', text1: 'Enter your answer', text2: 'Type something for Other.' });
      return;
    }
    const optionIndex = visibleOptions.findIndex((o) => o.id === selected);
    submitLockRef.current = true;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    pollVote.mutate(
      {
        challengeId,
        optionId: selected,
        optionIndex,
        userEventId: userEvent.id,
        customText: isOtherSelected ? otherText.trim() : null,
        commandId: occurrenceCommandId('poll-vote', userEvent.id),
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
        onSettled: () => {
          submitLockRef.current = false;
        },
      },
    );
  }, [selected, challengeId, userEvent, visibleOptions, pollVote, router, isOtherSelected, otherText]);

  const otherValidation = useMemo(() => {
    if (!isOtherSelected) return null;
    const trimmed = otherText.trim();
    if (!trimmed) return required(otherText, 'Enter your answer for Other.');
    return maxLength(otherText, 100);
  }, [isOtherSelected, otherText]);

  const canSubmit =
    Boolean(selected) && (!isOtherSelected || otherValidation?.ok === true) && !pollVote.isPending;

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
        content: {
          flexGrow: 1,
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.md,
          paddingBottom: Spacing.lg,
          gap: Spacing.lg,
          alignItems: 'center',
        },
        title: { textAlign: 'center' },
        optionsList: { width: '100%', gap: Spacing.sm },
        option: {
          borderRadius: Radius.lg,
          borderWidth: 2,
          padding: Spacing.md,
          alignItems: 'center',
        },
        otherInput: {
          width: '100%',
          marginTop: Spacing.sm,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          borderRadius: Radius.md,
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.sm,
          color: colors.text,
          backgroundColor: colors.surface,
          fontSize: 16,
          minHeight: 48,
        },
        keyboardRoot: {
          flex: 1,
        },
        footer: {
          width: '100%',
          paddingVertical: Spacing.lg,
        },
        voteButton: {
          width: '100%',
          height: 52,
          borderRadius: Radius.md,
          alignItems: 'center',
          justifyContent: 'center',
        },
      }),
    [colors],
  );

  if (eventLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={colors.text} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (optionsError || eventError) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <ChallengeTimer
            expiresAt={userEvent?.status === 'buy_in_open' ? null : userEvent?.expires_at}
            onExpire={() => void refetchEvent()}
          />
          <TouchableOpacity
            onPress={() => backOrHome(router)}
            hitSlop={16}
            style={{ padding: Spacing.sm }}
          >
            <IconClose size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <ErrorState
          title="Couldn't load poll"
          message="Check your connection and try again."
          onRetry={() => {
            void refetchEvent();
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.keyboardRoot}>
        <View style={styles.header}>
          <ChallengeTimer
            expiresAt={userEvent?.status === 'buy_in_open' ? null : userEvent?.expires_at}
            onExpire={() => void refetchEvent()}
          />
          <TouchableOpacity
            onPress={() => backOrHome(router)}
            hitSlop={16}
            style={{ padding: Spacing.sm }}
          >
            <IconClose size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <AppKeyboardAwareScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text variant="displayMedium" style={styles.title}>
            {challenge?.title ?? 'Poll'}
          </Text>

          {challenge?.description ? (
            <Text variant="body" color={colors.textSecondary} style={{ textAlign: 'center' }}>
              {challenge.description}
            </Text>
          ) : null}

          <View style={styles.optionsList}>
            {visibleOptions.map((opt) => {
              const isSelected = selected === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelected(opt.id);
                    if (!opt.is_other) setOtherText('');
                  }}
                  activeOpacity={0.85}
                  style={[
                    styles.option,
                    {
                      borderColor: isSelected ? colors.primary : colors.border,
                      backgroundColor: isSelected ? `${colors.primary}14` : colors.surface,
                    },
                  ]}
                >
                  <Text
                    variant="body"
                    color={isSelected ? colors.primary : colors.text}
                    style={{ fontWeight: isSelected ? '700' : '400' }}
                  >
                    {opt.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {isOtherSelected ? (
              <View style={{ width: '100%' }}>
                <AppTextInput
                  value={otherText}
                  onChangeText={setOtherText}
                  placeholder="Type your answer…"
                  placeholderTextColor={colors.textTertiary}
                  style={[
                    styles.otherInput,
                    otherValidation && !otherValidation.ok
                      ? { borderColor: colors.error, borderWidth: 1 }
                      : null,
                  ]}
                  maxLength={100}
                  autoFocus
                  onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
                />
                <Text
                  variant="bodySmall"
                  color={
                    otherValidation && !otherValidation.ok ? colors.error : colors.textTertiary
                  }
                  style={{ marginTop: Spacing.xs, textAlign: 'center' }}
                >
                  {otherValidation && !otherValidation.ok
                    ? otherValidation.message
                    : `${otherText.length}/100`}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.footer}>
            <TouchableOpacity
              onPress={handleVote}
              disabled={!canSubmit}
              activeOpacity={0.85}
              style={[
                styles.voteButton,
                {
                  backgroundColor: canSubmit ? colors.primary : colors.surfaceMuted,
                },
              ]}
            >
              {pollVote.isPending ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text variant="label" color={canSubmit ? colors.onPrimary : colors.textTertiary}>
                  {selected ? 'Submit Vote' : 'Pick an option'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </AppKeyboardAwareScrollView>
      </View>
    </SafeAreaView>
  );
}
