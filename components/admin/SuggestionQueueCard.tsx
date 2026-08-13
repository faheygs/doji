import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { suggestionOptionLabels } from '../../lib/suggestionDetails';
import type { ChallengeSuggestion } from '../../types/database';
import { Button } from '../ui/Button';
import { ProfileAvatar } from '../ui/ProfileAvatar';
import { Text } from '../ui/Text';

type Props = { suggestion: ChallengeSuggestion; busy: boolean; approving: boolean; rejecting: boolean; onOpen: () => void; onApprove: () => void; onReject: () => void };

export function SuggestionQueueCard({ suggestion, busy, approving, rejecting, onOpen, onApprove, onReject }: Props) {
  const { colors } = useTheme();
  const author = suggestion.profile;
  const fallbackHandle = `@${suggestion.user_id.slice(0, 8)}`;
  const options = suggestionOptionLabels(suggestion.options);
  return (
    <TouchableOpacity style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]} activeOpacity={0.8} onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Review ${suggestion.kind} suggestion`}>
      <View style={styles.metaRow}>
        <ProfileAvatar profile={author} size={40} />
        <View style={styles.copy}>
          <Text variant="subhead">{author?.display_name ?? fallbackHandle}</Text>
          <Text variant="micro" color={colors.textTertiary}>{author?.username ? `@${author.username}` : fallbackHandle} · {suggestion.kind}</Text>
        </View>
      </View>
      <Text variant="body" style={styles.body} numberOfLines={3}>{suggestion.body}</Text>
      {options.length ? <Text variant="micro" color={colors.textTertiary} numberOfLines={2}>{options.join('  ·  ')}</Text> : null}
      <View style={styles.actions} onStartShouldSetResponder={() => true}>
        <Button size="sm" variant="secondary" style={styles.action} loading={rejecting} disabled={busy} onPress={onReject}>Reject</Button>
        <Button size="sm" style={styles.action} loading={approving} disabled={busy} onPress={onApprove}>Approve</Button>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: Spacing.md, marginBottom: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, gap: Spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  copy: { flex: 1, gap: 2 },
  body: { lineHeight: 22 },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  action: { flex: 1 },
});
