import React, { useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { KeyboardSafeSheet } from '../ui/KeyboardSafeSheet';
import { useReportContent, type ReportReason } from '../../hooks/useReportContent';
import { InlineFeedback } from '../ui/InlineFeedback';

const REASONS: { value: ReportReason; label: string; description: string }[] = [
  { value: 'spam',          label: 'Spam',          description: 'Repetitive or unwanted content' },
  { value: 'inappropriate', label: 'Inappropriate', description: 'Offensive or explicit material' },
  { value: 'harassment',    label: 'Harassment',    description: 'Targeted bullying or abuse' },
  { value: 'other',         label: 'Other',         description: 'Something else' },
];

const styles = StyleSheet.create({
  list: { gap: Spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  optionText: { flex: 1, gap: 2 },
  footer: { flexDirection: 'row', gap: Spacing.sm },
});

type Props = {
  visible: boolean;
  reportedUserId: string;
  /** Report a post */
  postId?: string;
  /** Report a comment */
  commentId?: string;
  /** Report an "Other" poll vote */
  pollVoteId?: string;
  onClose: () => void;
};

function getTitle(props: Props): string {
  if (props.commentId) return 'Report comment';
  if (props.pollVoteId) return 'Report this answer';
  if (props.postId) return 'Report post';
  return 'Report user';
}

function getSubtitle(props: Props): string {
  if (props.commentId) return "What's wrong with this comment? We review all reports within 24 hours.";
  if (props.pollVoteId) return "What's wrong with this answer? We review all reports within 24 hours.";
  if (props.postId) return "What's wrong with this post? We review all reports within 24 hours.";
  return "Why are you reporting this user? We review all reports within 24 hours.";
}

export function ReportSheet({ visible, reportedUserId, postId, commentId, pollVoteId, onClose }: Props) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<ReportReason | null>(null);
  const [submitError, setSubmitError] = useState('');
  const report = useReportContent();

  const handleClose = useCallback(() => {
    setSelected(null);
    setSubmitError('');
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(() => {
    if (!selected) return;
    setSubmitError('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    report.mutate(
      { reportedUserId, postId, commentId, pollVoteId, reason: selected },
      {
        onSuccess: () => {
          Toast.show({
            type: 'success',
            text1: 'Report submitted',
            text2: "We'll review this within 24 hours.",
          });
          handleClose();
        },
        onError: () => {
          setSubmitError('Could not submit this report. Please try again.');
        },
      },
    );
  }, [selected, report, reportedUserId, postId, commentId, pollVoteId, handleClose]);

  const props = { visible, reportedUserId, postId, commentId, pollVoteId, onClose };

  return (
    <KeyboardSafeSheet
      visible={visible}
      onClose={handleClose}
      title={getTitle(props)}
      subtitle={getSubtitle(props)}
      footer={
        <View style={styles.footer}>
          <Button
            variant="secondary"
            style={{ flex: 1 }}
            onPress={handleClose}
            disabled={report.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            style={{ flex: 1 }}
            onPress={handleSubmit}
            loading={report.isPending}
            disabled={!selected || report.isPending}
          >
            Report
          </Button>
        </View>
      }
    >
      <View style={styles.list}>
        {REASONS.map((r) => {
          const isSelected = selected === r.value;
          return (
            <TouchableOpacity
              key={r.value}
              style={[
                styles.option,
                {
                  borderColor: isSelected ? colors.primary : colors.border,
                  backgroundColor: isSelected ? `${colors.primary}12` : colors.surfaceElevated,
                },
              ]}
              onPress={() => {
                setSelected(r.value);
                setSubmitError('');
              }}
              activeOpacity={0.75}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
            >
              <View style={[styles.radio, { borderColor: isSelected ? colors.primary : colors.border }]}>
                {isSelected ? (
                  <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />
                ) : null}
              </View>
              <View style={styles.optionText}>
                <Text variant="subhead">{r.label}</Text>
                <Text variant="micro" color={colors.textSecondary}>
                  {r.description}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
        {submitError ? <InlineFeedback message={submitError} /> : null}
      </View>
    </KeyboardSafeSheet>
  );
}
