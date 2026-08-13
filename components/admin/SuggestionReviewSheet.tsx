import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { suggestionKindLabel } from '../../hooks/useSuggestions';
import { suggestionOptionLabels, suggestionRuleLabel } from '../../lib/suggestionDetails';
import type { ChallengeSuggestion } from '../../types/database';
import { ProfileAvatar } from '../ui/ProfileAvatar';
import { Button } from '../ui/Button';
import { KeyboardSafeSheet } from '../ui/KeyboardSafeSheet';
import { Text } from '../ui/Text';

type Props = {
  suggestion: ChallengeSuggestion | null;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onClose: () => void;
};

export function SuggestionReviewSheet({ suggestion, busy, onApprove, onReject, onClose }: Props) {
  const { colors } = useTheme();
  if (!suggestion) return null;
  const options = suggestionOptionLabels(suggestion.options);
  const rule = suggestionRuleLabel(suggestion.options);
  const author = suggestion.profile;

  return (
    <KeyboardSafeSheet
      visible
      onClose={onClose}
      heightFraction={0.82}
      title="Review suggestion"
      subtitle={`${suggestionKindLabel(suggestion.kind)} · Submitted ${new Date(suggestion.created_at).toLocaleDateString()}`}
      footer={
        <View style={styles.actions}>
          <Button variant="secondary" style={styles.action} onPress={onReject} disabled={busy}>Reject</Button>
          <Button style={styles.action} onPress={onApprove} loading={busy} disabled={busy}>Approve</Button>
        </View>
      }
    >
      <View style={styles.author}>
        <ProfileAvatar profile={author} size={44} />
        <View style={styles.copy}>
          <Text variant="subhead">{author?.display_name || author?.username || 'Doji member'}</Text>
          {author?.username ? <Text variant="micro" color={colors.textTertiary}>@{author.username}</Text> : null}
        </View>
      </View>
      <View style={[styles.prompt, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text variant="micro" color={colors.textTertiary}>PROMPT</Text>
        <Text variant="headingMedium" style={styles.body}>{suggestion.body}</Text>
      </View>
      {options.length ? (
        <View style={styles.optionList}>
          <Text variant="micro" color={colors.textTertiary}>ANSWER OPTIONS</Text>
          {options.map((option, index) => (
            <View key={`${index}-${option}`} style={[styles.option, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}>
              <Text variant="micro" color={colors.textTertiary}>{index + 1}</Text>
              <Text variant="body" style={styles.copy}>{option}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {rule ? (
        <View style={[styles.option, { borderColor: colors.primary, backgroundColor: colors.primaryLight }]}>
          <Text variant="label" color={colors.primary}>{rule}</Text>
        </View>
      ) : null}
    </KeyboardSafeSheet>
  );
}

const styles = StyleSheet.create({
  author: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  copy: { flex: 1, gap: 2 },
  prompt: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.sm },
  body: { lineHeight: 27 },
  optionList: { gap: Spacing.sm },
  option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  action: { flex: 1 },
});
