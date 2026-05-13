import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';
import { CategoryBadge } from '../ui/CategoryBadge';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/useAuthStore';
import type { PollOption, Challenge } from '../../types/database';

type Props = {
  challenge: Challenge;
};

function PollResultCardImpl({ challenge }: Props) {
  const { colors } = useTheme();
  const userId = useAuthStore((s) => s.session?.user?.id);

  const { data: options = [] } = useQuery<PollOption[]>({
    queryKey: ['pollOptions', challenge.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('poll_options')
        .select('*')
        .eq('challenge_id', challenge.id)
        .order('position', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 10_000,
  });

  const { data: myVoteOptionId } = useQuery<string | null>({
    queryKey: ['myPollVote', challenge.id, userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('poll_votes')
        .select('option_id')
        .eq('challenge_id', challenge.id)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return data?.option_id ?? null;
    },
    enabled: !!userId,
  });

  const totalVotes = options.reduce((sum, o) => sum + (o.vote_count ?? 0), 0);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: colors.surface,
          borderRadius: Radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          marginHorizontal: Spacing.md,
          marginBottom: Spacing.md,
          padding: Spacing.md,
          gap: Spacing.sm,
        },
        header: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        optionRow: {
          borderRadius: Radius.md,
          overflow: 'hidden',
          backgroundColor: colors.surfaceMuted,
          position: 'relative',
        },
        optionBar: {
          position: 'absolute',
          top: 0,
          left: 0,
          bottom: 0,
          borderRadius: Radius.md,
        },
        optionContent: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.sm + 2,
        },
        footer: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: Spacing.xs,
        },
      }),
    [colors],
  );

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text variant="headingMedium" numberOfLines={2} style={{ flex: 1, marginRight: Spacing.sm }}>
          {challenge.title}
        </Text>
        <CategoryBadge category={challenge.category} size="sm" />
      </View>

      {options.map((opt) => {
        const count = opt.vote_count ?? 0;
        const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
        const isMyVote = myVoteOptionId === opt.id;
        const barColor = isMyVote ? colors.primary : colors.textTertiary;

        return (
          <View key={opt.id} style={styles.optionRow}>
            <View
              style={[
                styles.optionBar,
                {
                  width: `${pct}%`,
                  backgroundColor: `${barColor}20`,
                },
              ]}
            />
            <View style={styles.optionContent}>
              <Text
                variant="body"
                color={isMyVote ? colors.primary : colors.text}
                style={{ fontWeight: isMyVote ? '700' : '400', flex: 1 }}
              >
                {opt.text}{isMyVote ? ' ✓' : ''}
              </Text>
              <Text variant="label" color={colors.textSecondary}>
                {pct}%
              </Text>
            </View>
          </View>
        );
      })}

      <View style={styles.footer}>
        <Text variant="micro" color={colors.textTertiary}>
          {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
        </Text>
        <Text variant="micro" color={colors.textTertiary}>
          +{challenge.xp_reward} XP
        </Text>
      </View>
    </View>
  );
}

export const PollResultCard = React.memo(PollResultCardImpl);
