import React, { useCallback, useState } from 'react';
import {
  View, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  RefreshControl,
} from 'react-native';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { Spacing, webScrollParentStyle } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useAppDialog } from '@/contexts/DialogContext';
import { Text } from '@/components/ui/Text';
import { ErrorState } from '@/components/ui/ErrorState';
import { ListRowsSkeleton } from '@/components/ui/LoadingSkeletons';
import { SkeletonSwap } from '@/components/ui/SkeletonSwap';
import { IconChevronLeft } from '@/components/icons/Icons';
import { ModerationReportCard } from '@/components/admin/ModerationReportCard';
import {
  usePendingReports, useModerateReport, type ModerateAction, type Report,
} from '@/hooks/useReports';
import { goBackToExplicitReturn } from '@/lib/navigationReturn';
import { AdminQueueEmptyState } from '@/components/admin/AdminQueueEmptyState';
import { InlineFeedback } from '@/components/ui/InlineFeedback';

const ACTION_LABEL: Record<ModerateAction, string> = {
  dismiss: 'Report dismissed',
  remove_content: 'Content removed',
  remove_and_ban: 'Content removed and user banned',
};

export default function AdminReportsScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { colors } = useTheme();
  const { showDialog } = useAppDialog();
  const { data: reports = [], isLoading, isError, refetch, isRefetching } =
    usePendingReports();
  const coldError = isError && reports.length === 0;
  const moderate = useModerateReport();
  const [active, setActive] = useState<{ reportId: string; action: ModerateAction } | null>(null);
  const [actionError, setActionError] = useState('');

  const handleAction = useCallback((report: Report, action: ModerateAction) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActionError('');
    setActive({ reportId: report.id, action });
    moderate.mutate(
      { reportId: report.id, action },
      {
        onSuccess: () => Toast.show({ type: 'success', text1: ACTION_LABEL[action] }),
        onError: () => setActionError('That moderation action did not complete. Try again.'),
        onSettled: () => setActive(null),
      },
    );
  }, [moderate]);

  const requestAction = useCallback((report: Report, action: ModerateAction) => {
    if (action === 'dismiss') {
      handleAction(report, action);
      return;
    }
    const banning = action === 'remove_and_ban';
    showDialog({
      title: banning ? 'Remove content and ban user?' : 'Remove reported content?',
      message: banning
        ? 'This removes the reported content and prevents this account from using Doji.'
        : 'This permanently removes the reported content from Doji.',
      actions: [
        { label: 'Cancel', variant: 'cancel' },
        {
          label: banning ? 'Remove & ban' : 'Remove content',
          variant: 'destructive',
          onPress: () => handleAction(report, action),
        },
      ],
    });
  }, [handleAction, showDialog]);

  const handleBack = useCallback(() => {
    goBackToExplicitReturn(
      router,
      returnTo ?? '/(app)/profile/settings',
      '/(app)/profile/settings' as Href,
    );
  }, [router, returnTo]);

  return (
    <SafeAreaView style={[styles.container, webScrollParentStyle, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back"
        >
          <IconChevronLeft size={26} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text variant="headingLarge">Pending reports</Text>
          {!isLoading && !coldError ? (
            <Text variant="micro" color={colors.textTertiary}>
              {reports.length === 0 ? 'Queue is empty' : `${reports.length} awaiting review`}
            </Text>
          ) : null}
        </View>
      </View>

      <SkeletonSwap
        loading={isLoading && reports.length === 0}
        skeleton={<ListRowsSkeleton rows={3} label="Loading pending reports" />}
      >
        {coldError ? (
          <ErrorState
            title="Couldn't load reports"
            message="We couldn't reach the moderation queue. Try again in a moment."
            onRetry={() => void refetch()}
          />
        ) : (
          <ScrollView
            style={webScrollParentStyle}
            contentContainerStyle={styles.content}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.text}
              />
            }
          >
            {actionError ? (
              <InlineFeedback
                title="Could not update report"
                message={actionError}
                style={{ marginHorizontal: Spacing.md, marginBottom: Spacing.md }}
              />
            ) : null}
            {reports.length === 0 ? (
              <AdminQueueEmptyState
                title="No reports to review"
                message="Reported posts and comments will appear here when they need attention."
              />
            ) : reports.map((report) => (
              <ModerationReportCard
                key={report.id}
                report={report}
                busyAction={active?.reportId === report.id ? active.action : undefined}
                disabled={moderate.isPending}
                onAction={(action) => requestAction(report, action)}
              />
            ))}
          </ScrollView>
        )}
      </SkeletonSwap>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
  },
  headerText: { flex: 1, gap: 2 },
  content: { paddingBottom: Spacing.xxl, flexGrow: 1 },
});
