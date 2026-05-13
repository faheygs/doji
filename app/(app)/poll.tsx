import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../../components/ui/Text';
import { CountdownRing } from '../../components/challenge/CountdownRing';
import { IconClose } from '../../components/icons/Icons';
import { ErrorState } from '../../components/ui/ErrorState';
import { useUserEvent } from '../../hooks/useUserEvent';
import { usePollVote } from '../../hooks/usePollVote';
import { supabase } from '../../lib/supabase';
import { getTimeRemaining } from '../../utils/time';
import type { PollOption } from '../../types/database';

export default function PollScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: userEvent, isLoading: eventLoading } = useUserEvent();
  const pollVote = usePollVote();
  const [selected, setSelected] = useState<string | null>(null);

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

  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (!userEvent) return;
    setTimeLeft(getTimeRemaining(userEvent.expires_at));
    const interval = setInterval(() => {
      const remaining = getTimeRemaining(userEvent.expires_at);
      setTimeLeft(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [userEvent]);

  const windowSeconds = useMemo(() => {
    if (!userEvent?.expires_at || !userEvent?.created_at) return 15 * 60;
    const created = new Date(userEvent.created_at).getTime();
    const expires = new Date(userEvent.expires_at).getTime();
    const diff = Math.floor((expires - created) / 1000);
    return diff > 0 ? diff : 15 * 60;
  }, [userEvent?.expires_at, userEvent?.created_at]);

  const handleVote = useCallback(async () => {
    if (!selected || !challengeId || !userEvent) return;
    const optionIndex = options.findIndex((o) => o.id === selected);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    pollVote.mutate(
      {
        challengeId,
        optionId: selected,
        optionIndex,
        userEventId: userEvent.id,
      },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.replace('/(app)');
          Toast.show({ type: 'success', text1: 'Vote submitted!' });
        },
        onError: (err: Error) => {
          Toast.show({ type: 'error', text1: err.message ?? 'Failed to vote' });
        },
      },
    );
  }, [selected, challengeId, userEvent, options, pollVote, router]);

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
          flex: 1,
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.md,
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
          <TouchableOpacity onPress={() => router.back()} hitSlop={16} style={{ padding: Spacing.sm }}>
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={16} style={{ padding: Spacing.sm }}>
          <IconClose size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <CountdownRing
          totalSeconds={windowSeconds}
          remainingSeconds={timeLeft}
          size={120}
          strokeWidth={5}
        />

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
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          onPress={handleVote}
          disabled={!selected || pollVote.isPending}
          activeOpacity={0.85}
          style={[
            styles.voteButton,
            {
              backgroundColor: selected ? colors.primary : colors.surfaceMuted,
            },
          ]}
        >
          {pollVote.isPending ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text variant="label" color={selected ? '#FFFFFF' : colors.textTertiary}>
              {selected ? 'Submit Vote' : 'Pick an option'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
