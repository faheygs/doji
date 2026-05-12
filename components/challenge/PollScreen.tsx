import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';
import { Typography, Spacing, Radius } from '../../constants/theme';
import { IconChevronLeft } from '../icons/Icons';
import { IcnBarChart } from '../icons/BadgeIcons';
import type { Challenge, PollOption } from '../../types/database';

type Props = {
  challenge: Challenge;
  options: PollOption[];
  onVote: (optionId: string, optionIndex: number) => Promise<void>;
  onBack: () => void;
  existingVoteOptionId?: string | null;
};

export function PollScreen({ challenge, options, onVote, onBack, existingVoteOptionId }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string | null>(existingVoteOptionId ?? null);
  const [submitting, setSubmitting] = useState(false);
  const hasVoted = !!existingVoteOptionId || submitting;
  const totalVotes = options.reduce((s, o) => s + o.vote_count, 0);

  const handleVote = async (optionId: string, index: number) => {
    if (hasVoted) return;
    setSelected(optionId);
    setSubmitting(true);
    try {
      await onVote(optionId, index);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={16}>
        <IconChevronLeft size={24} color={colors.textSecondary} />
      </TouchableOpacity>

      <View style={[styles.iconCircle, { backgroundColor: colors.primaryPale }]}>
        <IcnBarChart size={32} color={colors.primary} />
      </View>

      <Text variant="title" style={{ textAlign: 'center' }}>
        {challenge.title}
      </Text>
      {challenge.description ? (
        <Text variant="body" color={colors.textSecondary} style={{ textAlign: 'center', marginTop: Spacing.xs }}>
          {challenge.description}
        </Text>
      ) : null}

      <View style={styles.optionsContainer}>
        {options
          .sort((a, b) => a.position - b.position)
          .map((opt, idx) => {
            const isSelected = selected === opt.id;
            const pct = totalVotes > 0 ? (opt.vote_count / totalVotes) * 100 : 0;
            const showResults = hasVoted || !!existingVoteOptionId;

            return (
              <TouchableOpacity
                key={opt.id}
                onPress={() => handleVote(opt.id, idx)}
                disabled={hasVoted}
                style={[
                  styles.option,
                  {
                    backgroundColor: colors.surface,
                    borderColor: isSelected ? colors.primary : colors.border,
                    borderWidth: isSelected ? 2 : 1,
                  },
                ]}
                activeOpacity={0.8}
              >
                {showResults && (
                  <View
                    style={[
                      styles.resultBar,
                      {
                        backgroundColor: isSelected ? colors.primaryPale : colors.surfaceMuted,
                        width: `${pct}%`,
                      },
                    ]}
                  />
                )}
                <Text variant="body" style={{ zIndex: 1 }}>
                  {opt.text}
                </Text>
                {showResults && (
                  <Text variant="micro" color={colors.textSecondary} style={{ zIndex: 1 }}>
                    {Math.round(pct)}%
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
      </View>

      {submitting && <ActivityIndicator color={colors.primary} style={{ marginTop: Spacing.md }} />}

      <Text variant="caption" color={colors.textTertiary} style={{ textAlign: 'center', marginTop: Spacing.lg }}>
        {totalVotes} vote{totalVotes !== 1 ? 's' : ''} · +{challenge.xp_reward} XP
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.lg },
  backBtn: { marginBottom: Spacing.md },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },
  optionsContainer: { marginTop: Spacing.xl, gap: Spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Radius.md,
    padding: Spacing.md,
    overflow: 'hidden',
    minHeight: 52,
  },
  resultBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: Radius.md,
  },
});
