import React, { useMemo, useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Spacing, Radius, Shadows } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { IconChevronRight } from '@/components/icons/Icons';
import { suggestionKindLabel, suggestionStatusColor } from '@/hooks/useSuggestions';
import { formatCompactRelativeTime } from '@/utils/time';
import type { ChallengeSuggestion } from '@/types/database';

type Props = {
  submission: ChallengeSuggestion;
};

function reviewerLabel(submission: ChallengeSuggestion): string | null {
  const reviewer = submission.reviewer;
  if (!reviewer) return null;
  if (reviewer.display_name?.trim()) return reviewer.display_name.trim();
  if (reviewer.username?.trim()) return `@${reviewer.username}`;
  return 'Admin';
}

export function SubmissionCard({ submission }: Props) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const statusColor = suggestionStatusColor(submission.status, colors);

  const toggle = useCallback(() => {
    Haptics.selectionAsync();
    setExpanded((v) => !v);
  }, []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: colors.surface,
          borderRadius: Radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
          ...Shadows.card,
        },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.md,
        },
        body: {
          flex: 1,
          lineHeight: 20,
        },
        statusPill: {
          paddingHorizontal: Spacing.sm,
          paddingVertical: 4,
          borderRadius: Radius.full,
          backgroundColor: `${statusColor}18`,
        },
        chevron: {
          transform: [{ rotate: expanded ? '90deg' : '0deg' }],
        },
        details: {
          paddingHorizontal: Spacing.md,
          paddingBottom: Spacing.md,
          gap: Spacing.sm,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          paddingTop: Spacing.sm,
        },
        detailRow: {
          gap: 2,
        },
        feedbackBlock: {
          gap: 4,
          paddingTop: Spacing.xs,
        },
      }),
    [colors, expanded, statusColor],
  );

  return (
    <View style={styles.card}>
      <TouchableOpacity
        onPress={toggle}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Submission: ${submission.body}`}
      >
        <View style={styles.row}>
          <Text
            variant="body"
            style={styles.body}
            numberOfLines={expanded ? undefined : 1}
          >
            {submission.body}
          </Text>
          <View style={styles.statusPill}>
            <Text
              variant="micro"
              color={statusColor}
              style={{ textTransform: 'capitalize', fontWeight: '700' }}
            >
              {submission.status}
            </Text>
          </View>
          <View style={styles.chevron}>
            <IconChevronRight size={18} color={colors.textTertiary} />
          </View>
        </View>
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.details}>
          <View style={styles.detailRow}>
            <Text variant="micro" color={colors.textTertiary}>
              {suggestionKindLabel(submission.kind)} · Submitted{' '}
              {formatCompactRelativeTime(submission.created_at)}
            </Text>
          </View>

          {submission.status === 'pending' ? (
            <Text variant="bodySmall" color={colors.textSecondary}>
              Waiting for review.
            </Text>
          ) : null}

          {submission.status === 'approved' ? (
            <Text variant="bodySmall" color={colors.textSecondary}>
              {submission.reviewer
                ? `Approved by ${reviewerLabel(submission)}`
                : 'Approved'}
              {submission.reviewed_at
                ? ` · ${formatCompactRelativeTime(submission.reviewed_at)}`
                : ''}
            </Text>
          ) : null}

          {submission.status === 'rejected' ? (
            <>
              {submission.reviewer ? (
                <Text variant="bodySmall" color={colors.textSecondary}>
                  Rejected by {reviewerLabel(submission)}
                  {submission.reviewed_at
                    ? ` · ${formatCompactRelativeTime(submission.reviewed_at)}`
                    : ''}
                </Text>
              ) : null}
              {submission.admin_note?.trim() ? (
                <View style={styles.feedbackBlock}>
                  <Text
                    variant="micro"
                    color={colors.textTertiary}
                    style={{ fontWeight: '700', letterSpacing: 0.4 }}
                  >
                    FEEDBACK
                  </Text>
                  <Text variant="bodySmall" color={colors.textSecondary} style={{ lineHeight: 20 }}>
                    {submission.admin_note}
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
