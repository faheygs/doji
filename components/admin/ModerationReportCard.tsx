import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';
import { formatRelativeTime } from '@/utils/time';
import type { Report } from '@/types/database';
import type { ModerateAction } from '@/hooks/useReports';

const REASON_LABEL: Record<string, string> = {
  spam: 'Spam', inappropriate: 'Inappropriate', harassment: 'Harassment', other: 'Other',
};

function evidenceFor(report: Report) {
  if (report.comment?.body) return { label: 'Reported comment', body: report.comment.body };
  if (report.poll_vote?.custom_text) {
    return { label: 'Reported poll response', body: report.poll_vote.custom_text };
  }
  if (report.post?.caption || report.post?.photo_url) {
    return { label: 'Reported post', body: report.post.caption };
  }
  return { label: 'Reported content', body: 'The original content is no longer available.' };
}

type Props = {
  report: Report;
  busyAction?: ModerateAction;
  disabled: boolean;
  onAction: (action: ModerateAction) => void;
};

export function ModerationReportCard({ report, busyAction, disabled, onAction }: Props) {
  const { colors } = useTheme();
  const evidence = evidenceFor(report);
  const canRemoveContent = !!(report.post_id || report.comment_id || report.poll_vote_id);
  const styles = useMemo(() => StyleSheet.create({
    card: {
      marginHorizontal: Spacing.md, marginBottom: Spacing.md, padding: Spacing.md,
      borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border,
      backgroundColor: colors.surfaceElevated, gap: Spacing.md,
    },
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    reasonBadge: {
      paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full,
      backgroundColor: `${colors.warning}1F`, borderWidth: 1, borderColor: `${colors.warning}66`,
    },
    reporterRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    reporterCopy: { flex: 1 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline },
    subject: { gap: Spacing.sm },
    subjectRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    subjectCopy: { flex: 1 },
    evidence: {
      overflow: 'hidden', borderRadius: Radius.md, borderWidth: 1,
      borderColor: colors.border, backgroundColor: colors.surfaceMuted,
    },
    evidenceLabel: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md },
    evidenceBody: { padding: Spacing.md, lineHeight: 22 },
    photo: { width: '100%', aspectRatio: 16 / 10, backgroundColor: colors.mediaLetterbox },
    notes: {
      padding: Spacing.sm, borderRadius: Radius.sm, backgroundColor: `${colors.warning}12`,
    },
    actions: { gap: Spacing.sm },
    actionRow: { flexDirection: 'row', gap: Spacing.sm },
    actionButton: { flex: 1 },
  }), [colors]);

  return (
    <View style={styles.card} accessibilityLabel={`Report: ${REASON_LABEL[report.reason]}`}>
      <View style={styles.topRow}>
        <View style={styles.reasonBadge}>
          <Text variant="label" color={colors.warning}>{REASON_LABEL[report.reason]}</Text>
        </View>
        <Text variant="micro" color={colors.textTertiary}>
          {formatRelativeTime(report.created_at)}
        </Text>
      </View>

      <View style={styles.reporterRow}>
        <ProfileAvatar profile={report.reporter} size={28} />
        <View style={styles.reporterCopy}>
          <Text variant="micro" color={colors.textTertiary}>Reported by</Text>
          <Text variant="label">@{report.reporter?.username ?? 'unknown'}</Text>
        </View>
      </View>
      <View style={styles.divider} />

      <View style={styles.subject}>
        <Text variant="micro" color={colors.textTertiary}>REPORTED ACCOUNT</Text>
        <View style={styles.subjectRow}>
          <ProfileAvatar profile={report.reported_user} size={44} />
          <View style={styles.subjectCopy}>
            <Text variant="subhead">{report.reported_user?.display_name ?? 'Deleted account'}</Text>
            {report.reported_user?.username ? (
              <Text variant="micro" color={colors.textSecondary}>@{report.reported_user.username}</Text>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.evidence}>
        <Text variant="micro" color={colors.textTertiary} style={styles.evidenceLabel}>
          {evidence.label.toUpperCase()}
        </Text>
        {report.post?.photo_url ? (
          <Image source={{ uri: report.post.photo_url }} style={styles.photo} contentFit="cover" />
        ) : null}
        <Text variant="body" style={styles.evidenceBody}>{evidence.body}</Text>
      </View>
      {report.notes ? (
        <View style={styles.notes}><Text variant="micro">Reporter note: {report.notes}</Text></View>
      ) : null}

      <View style={styles.actions}>
        <View style={styles.actionRow}>
          <Button
            size="sm" variant="secondary" style={styles.actionButton}
            loading={busyAction === 'dismiss'} disabled={disabled} onPress={() => onAction('dismiss')}
          >Dismiss report</Button>
          {canRemoveContent ? (
            <Button
              size="sm" variant="secondary" style={styles.actionButton}
              loading={busyAction === 'remove_content'} disabled={disabled}
              onPress={() => onAction('remove_content')}
            >Remove content</Button>
          ) : null}
        </View>
        {report.reported_user_id ? (
          <Button
            size="sm" variant="danger" fullWidth
            loading={busyAction === 'remove_and_ban'} disabled={disabled}
            onPress={() => onAction('remove_and_ban')}
          >Remove content & ban user</Button>
        ) : null}
      </View>
    </View>
  );
}
