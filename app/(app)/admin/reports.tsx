import React, { useCallback, useState } from 'react';
import {
  View, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { Spacing, webScrollParentStyle } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useAppDialog } from '@/contexts/DialogContext';
import { Text } from '@/components/ui/Text';
import { ErrorState } from '@/components/ui/ErrorState';
import { IconChevronLeft } from '@/components/icons/Icons';
import { ModerationReportCard } from '@/components/admin/ModerationReportCard';
import {
  usePendingReports, useModerateReport, type ModerateAction, type Report,
} from '@/hooks/useReports';
import { goBackWithOptionalReturn } from '@/lib/navigationReturn';

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
  const { data: reports = [], isLoading, isError, error, refetch, isRefetching } =
    usePendingReports();
  const moderate = useModerateReport();
  const [active, setActive] = useState<{ reportId: string; action: ModerateAction } | null>(null);

  const handleAction = useCallback((report: Report, action: ModerateAction) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActive({ reportId: report.id, action });
    moderate.mutate(
      { reportId: report.id, action },
      {
        onSuccess: () => Toast.show({ type: 'success', text1: ACTION_LABEL[action] }),
        onError: () => Toast.show({ type: 'error', text1: 'Action failed' }),
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
    goBackWithOptionalReturn(router, returnTo, '/(app)/profile/settings' as Href);
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
          {!isLoading && !isError ? (
            <Text variant="micro" color={colors.textTertiary}>
              {reports.length === 0 ? 'Queue is empty' : `${reports.length} awaiting review`}
            </Text>
          ) : null}
        </View>
      </View>

      {isLoading && reports.length === 0 ? (
        <View style={styles.empty}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : isError ? (
        <ErrorState
          title="Couldn't load reports"
          message={error instanceof Error ? error.message : 'Check your connection and try again.'}
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
          {reports.length === 0 ? (
            <View style={styles.empty}>
              <Text variant="body" color={colors.textSecondary}>No pending reports — all clear.</Text>
            </View>
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
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
});
