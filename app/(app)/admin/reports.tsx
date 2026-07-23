import React, { useMemo, useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { Spacing, Radius, webScrollParentStyle } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { ErrorState } from '@/components/ui/ErrorState';
import { IconChevronLeft } from '@/components/icons/Icons';
import { usePendingReports, useModerateReport, type ModerateAction } from '@/hooks/useReports';
import { goBackWithOptionalReturn } from '@/lib/navigationReturn';

const REASON_LABEL: Record<string, string> = {
  spam: 'Spam',
  inappropriate: 'Inappropriate',
  harassment: 'Harassment',
  other: 'Other',
};

const ACTION_LABEL: Record<ModerateAction, string> = {
  dismiss: 'Report dismissed',
  remove_content: 'Content removed',
  remove_and_ban: 'Content removed and user banned',
};

export default function AdminReportsScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { colors } = useTheme();
  const {
    data: reports = [],
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = usePendingReports();
  const moderate = useModerateReport();
  const [activeId, setActiveId] = useState<string | null>(null);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        header: {
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
        },
        headerText: { flex: 1, gap: 2 },
        card: {
          marginHorizontal: Spacing.md,
          marginBottom: Spacing.md,
          padding: Spacing.md,
          borderRadius: Radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceElevated,
          gap: Spacing.sm,
        },
        metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
        reasonBadge: {
          alignSelf: 'flex-start',
          paddingHorizontal: Spacing.sm,
          paddingVertical: 3,
          borderRadius: Radius.full,
          backgroundColor: `${colors.warning}22`,
          borderWidth: 1,
          borderColor: `${colors.warning}66`,
        },
        actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs, flexWrap: 'wrap' },
        empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
      }),
    [colors],
  );

  const handleAction = useCallback(
    (
      reportId: string,
      action: ModerateAction,
      postId?: string | null,
      commentId?: string | null,
      reportedUserId?: string | null,
    ) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setActiveId(reportId);
      moderate.mutate(
        { reportId, action, postId, commentId, reportedUserId },
        {
          onSuccess: () => {
            Toast.show({ type: 'success', text1: ACTION_LABEL[action] });
          },
          onError: () => Toast.show({ type: 'error', text1: 'Action failed' }),
          onSettled: () => setActiveId(null),
        },
      );
    },
    [moderate],
  );

  const handleBack = useCallback(() => {
    goBackWithOptionalReturn(router, returnTo, '/(app)/profile/settings' as Href);
  }, [router, returnTo]);

  return (
    <SafeAreaView style={[styles.container, webScrollParentStyle]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} hitSlop={12} accessibilityLabel="Back">
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
        <View style={styles.empty}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : isError ? (
        <ErrorState
          title="Couldn't load reports"
          message={error instanceof Error ? error.message : 'Check your connection and try again.'}
          onRetry={() => void refetch()}
        />
      ) : (
        <ScrollView
          style={webScrollParentStyle}
          contentContainerStyle={{ paddingBottom: Spacing.xxl, flexGrow: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
              tintColor={colors.text}
            />
          }
        >
          {reports.length === 0 ? (
            <View style={styles.empty}>
              <Text variant="body" color={colors.textSecondary}>
                No pending reports — all clear.
              </Text>
            </View>
          ) : (
            reports.map((r) => {
              const isActing = moderate.isPending && activeId === r.id;
              return (
                <View key={r.id} style={styles.card}>
                  {/* Reason badge */}
                  <View style={styles.reasonBadge}>
                    <Text variant="label" color={colors.warning}>
                      {REASON_LABEL[r.reason] ?? r.reason}
                    </Text>
                  </View>

                  {/* Reporter */}
                  <View style={styles.metaRow}>
                    <Avatar
                      uri={r.reporter?.avatar_url}
                      username={r.reporter?.username ?? 'reporter'}
                      size={28}
                    />
                    <Text variant="micro" color={colors.textSecondary}>
                      Reported by{' '}
                      <Text variant="micro" color={colors.text}>
                        @{r.reporter?.username ?? r.reporter_id.slice(0, 8)}
                      </Text>
                    </Text>
                  </View>

                  {/* Reported user */}
                  {r.reported_user ? (
                    <View style={styles.metaRow}>
                      <Avatar
                        uri={r.reported_user.avatar_url}
                        username={r.reported_user.username}
                        size={28}
                      />
                      <View>
                        <Text variant="subhead">{r.reported_user.display_name}</Text>
                        <Text variant="micro" color={colors.textTertiary}>
                          @{r.reported_user.username}
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  {/* Content preview */}
                  {r.post?.caption ? (
                    <Text variant="body" color={colors.textSecondary} style={{ lineHeight: 20 }} numberOfLines={3}>
                      {r.post.caption}
                    </Text>
                  ) : r.post_id ? (
                    <Text variant="micro" color={colors.textTertiary}>
                      Post ID: {r.post_id}
                    </Text>
                  ) : null}
                  {r.comment?.body ? (
                    <Text variant="body" color={colors.textSecondary} style={{ lineHeight: 20 }} numberOfLines={3}>
                      Comment: "{r.comment.body}"
                    </Text>
                  ) : r.comment_id ? (
                    <Text variant="micro" color={colors.textTertiary}>
                      Comment ID: {r.comment_id}
                    </Text>
                  ) : null}
                  {r.poll_vote?.custom_text ? (
                    <Text variant="body" color={colors.textSecondary} style={{ lineHeight: 20 }} numberOfLines={3}>
                      Poll answer: "{r.poll_vote.custom_text}"
                    </Text>
                  ) : null}

                  {/* Actions */}
                  <View style={styles.actions}>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={isActing}
                      disabled={moderate.isPending}
                      onPress={() => handleAction(r.id, 'dismiss', r.post_id, r.comment_id, r.reported_user_id)}
                    >
                      Dismiss
                    </Button>
                    {r.post_id ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={isActing}
                        disabled={moderate.isPending}
                        onPress={() => handleAction(r.id, 'remove_content', r.post_id, null, r.reported_user_id)}
                      >
                        Remove post
                      </Button>
                    ) : null}
                    {r.comment_id ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={isActing}
                        disabled={moderate.isPending}
                        onPress={() => handleAction(r.id, 'remove_content', null, r.comment_id, r.reported_user_id)}
                      >
                        Remove comment
                      </Button>
                    ) : null}
                    {r.reported_user_id ? (
                      <Button
                        size="sm"
                        variant="danger"
                        loading={isActing}
                        disabled={moderate.isPending}
                        onPress={() => handleAction(r.id, 'remove_and_ban', r.post_id, r.comment_id, r.reported_user_id)}
                      >
                        Remove + Ban
                      </Button>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
