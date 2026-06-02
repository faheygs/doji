import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../../components/ui/Text';
import { IconClose } from '../../components/icons/Icons';
import { ErrorState } from '../../components/ui/ErrorState';
import { useUserEvent } from '../../hooks/useUserEvent';
import { usePollVote } from '../../hooks/usePollVote';
import { supabase } from '../../lib/supabase';
import type { PollOption } from '../../types/database';
import { backOrHome, navigateToFeedAfterChallengeComplete } from '../../lib/navigationReturn';
import { canSubmitChallenge } from '../../lib/participationGate';
import { isExpired } from '../../utils/time';
import { XpGainOverlay } from '../../components/gamification/XpGainOverlay';
import { useChallengeCompleteOverlay } from '../../hooks/useChallengeCompleteOverlay';
import { buildXpOverlayPayload } from '../../lib/challengeComplete';
import { maxLength, required } from '../../lib/formValidation';

export default function PollScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: userEvent, isLoading: eventLoading } = useUserEvent();
  const pollVote = usePollVote();
  const [selected, setSelected] = useState<string | null>(null);
  const [otherText, setOtherText] = useState('');
  const { xpOverlay, setXpOverlay, dismissToFeed } = useChallengeCompleteOverlay();
  const scrollRef = useRef<ScrollView>(null);

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

  const {
    data: options = [],
    isLoading: optionsLoading,
    isError: optionsError,
    refetch: refetchOptions,
  } = useQuery<PollOption[]>({
    queryKey: ['pollOptions', challengeId],
    queryFn: async () => {
      if (!challengeId) return [];
      const { data, error } = await supabase
        .from('poll_options')
        .select('*')
        .eq('challenge_id', challengeId)
        .order('position', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!challengeId,
  });

  const selectedOption = options.find((o) => o.id === selected);
  const isOtherSelected = Boolean(selectedOption?.is_other);

  useEffect(() => {
    if (!isOtherSelected) return;
    const t = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 120);
    return () => clearTimeout(t);
  }, [isOtherSelected]);

  useEffect(() => {
    if (!isOtherSelected) return;
    const sub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        scrollRef.current?.scrollToEnd({ animated: true });
      },
    );
    return () => sub.remove();
  }, [isOtherSelected]);

  const handleVote = useCallback(async () => {
    if (!selected || !challengeId || !userEvent) return;
    if (isOtherSelected && !otherText.trim()) {
      Toast.show({ type: 'error', text1: 'Enter your answer', text2: 'Type something for Other.' });
      return;
    }
    if (!canSubmitChallenge(userEvent) || isExpired(userEvent.expires_at)) {
      Toast.show({ type: 'error', text1: "Time's up!", text2: "You missed today's window." });
      navigateToFeedAfterChallengeComplete(router);
      return;
    }
    const optionIndex = options.findIndex((o) => o.id === selected);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    pollVote.mutate(
      {
        challengeId,
        optionId: selected,
        optionIndex,
        userEventId: userEvent.id,
        customText: isOtherSelected ? otherText.trim() : null,
      },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setXpOverlay(
            buildXpOverlayPayload('poll', challenge?.xp_reward, {
              fromBuyIn: userEvent?.status === 'buy_in_open',
            }),
          );
        },
        onError: (err: Error) => {
          Toast.show({ type: 'error', text1: err.message ?? 'Failed to vote' });
        },
      },
    );
  }, [selected, challengeId, userEvent, options, pollVote, router, challenge?.xp_reward, isOtherSelected, otherText]);

  const otherValidation = useMemo(() => {
    if (!isOtherSelected) return null;
    const trimmed = otherText.trim();
    if (!trimmed) return required(otherText, 'Enter your answer for Other.');
    return maxLength(otherText, 100);
  }, [isOtherSelected, otherText]);

  const canSubmit =
    Boolean(selected) &&
    (!isOtherSelected || (otherValidation?.ok === true)) &&
    !pollVote.isPending;

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
          padding: Spacing.lg,
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

  if (eventLoading || optionsLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={colors.text} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (optionsError) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => backOrHome(router)} hitSlop={16} style={{ padding: Spacing.sm }}>
            <IconClose size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <ErrorState
          title="Couldn't load poll options"
          message="Check your connection and try again."
          onRetry={() => void refetchOptions()}
        />
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
        style={styles.keyboardRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => backOrHome(router)} hitSlop={16} style={{ padding: Spacing.sm }}>
            <IconClose size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
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
            {options.map((opt) => {
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
                <TextInput
                  value={otherText}
                  onChangeText={setOtherText}
                  placeholder="Type your answer…"
                  placeholderTextColor={colors.textTertiary}
                  style={[
                    styles.otherInput,
                    otherValidation && !otherValidation.ok ? { borderColor: colors.error, borderWidth: 1 } : null,
                  ]}
                  maxLength={100}
                  autoFocus
                  onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
                />
                <Text
                  variant="bodySmall"
                  color={
                    otherValidation && !otherValidation.ok
                      ? colors.error
                      : colors.textTertiary
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
        </ScrollView>

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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
