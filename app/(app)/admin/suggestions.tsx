import React, { useMemo, useCallback, useState, useEffect } from 'react';
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
import { Input } from '@/components/ui/Input';
import { KeyboardSafeSheet } from '@/components/ui/KeyboardSafeSheet';
import { Avatar } from '@/components/ui/Avatar';
import { ErrorState } from '@/components/ui/ErrorState';
import { IconChevronLeft } from '@/components/icons/Icons';
import { usePendingSuggestions, useReviewSuggestion } from '@/hooks/useSuggestions';
import { goBackWithOptionalReturn } from '@/lib/navigationReturn';

const REJECT_NOTE_MAX = 500;

function RejectSuggestionSheet({
  visible,
  loading,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  loading: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!visible) setNote('');
  }, [visible]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleConfirm = useCallback(() => {
    onConfirm(note.trim());
  }, [note, onConfirm]);

  return (
    <KeyboardSafeSheet
      visible={visible}
      onClose={handleClose}
      title="Reject suggestion"
      subtitle="Optionally tell the submitter why this idea was not accepted."
      footer={
        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          <Button variant="secondary" style={{ flex: 1 }} onPress={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" style={{ flex: 1 }} loading={loading} onPress={handleConfirm}>
            Reject
          </Button>
        </View>
      }
    >
      <Input
        value={note}
        onChangeText={setNote}
        placeholder="Reason (optional)"
        multiline
        maxLength={REJECT_NOTE_MAX}
        editable={!loading}
        hint={`${note.length}/${REJECT_NOTE_MAX}`}
        style={{ minHeight: 96, textAlignVertical: 'top' }}
      />
    </KeyboardSafeSheet>
  );
}

export default function AdminSuggestionsScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { colors } = useTheme();
  const {
    data: suggestions = [],
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = usePendingSuggestions();
  const review = useReviewSuggestion();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);

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
        actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
        empty: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: Spacing.xl,
        },
      }),
    [colors],
  );

  const handleApprove = useCallback(
    (id: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setActiveReviewId(id);
      review.mutate(
        { id, status: 'approved' },
        {
          onSuccess: () => {
            Toast.show({ type: 'success', text1: 'Suggestion approved' });
          },
          onError: () => {
            Toast.show({ type: 'error', text1: 'Review failed' });
          },
          onSettled: () => setActiveReviewId(null),
        },
      );
    },
    [review],
  );

  const handleRejectConfirm = useCallback(
    (note: string) => {
      if (!rejectingId) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setActiveReviewId(rejectingId);
      review.mutate(
        { id: rejectingId, status: 'rejected', adminNote: note || null },
        {
          onSuccess: () => {
            setRejectingId(null);
            Toast.show({ type: 'success', text1: 'Suggestion rejected' });
          },
          onError: () => {
            Toast.show({ type: 'error', text1: 'Review failed' });
          },
          onSettled: () => setActiveReviewId(null),
        },
      );
    },
    [rejectingId, review],
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
          <Text variant="headingLarge">Pending suggestions</Text>
          {!isLoading && !isError ? (
            <Text variant="micro" color={colors.textTertiary}>
              {suggestions.length === 0
                ? 'Queue is empty'
                : `${suggestions.length} awaiting review`}
            </Text>
          ) : null}
        </View>
      </View>

      {isLoading && suggestions.length === 0 ? (
        <View style={styles.empty}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : isError ? (
        <ErrorState
          title="Couldn't load suggestions"
          message={error instanceof Error ? error.message : 'Check your connection and try again.'}
          onRetry={() => void refetch()}
        />
      ) : (
        <ScrollView
          style={webScrollParentStyle}
          contentContainerStyle={{ paddingBottom: Spacing.xxl, flexGrow: 1 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.text} />
          }
        >
          {suggestions.length === 0 ? (
            <View style={styles.empty}>
              <Text variant="body" color={colors.textSecondary}>
                No pending suggestions — you're all caught up.
              </Text>
            </View>
          ) : (
            suggestions.map((s) => {
              const author = s.profile;
              const fallbackHandle = `@${s.user_id.slice(0, 8)}`;
              return (
                <View key={s.id} style={styles.card}>
                  <View style={styles.metaRow}>
                    <Avatar
                      uri={author?.avatar_url}
                      username={author?.username ?? fallbackHandle}
                      size={36}
                    />
                    <View>
                      <Text variant="subhead">{author?.display_name ?? fallbackHandle}</Text>
                      <Text variant="micro" color={colors.textTertiary}>
                        {author?.username ? `@${author.username}` : fallbackHandle} · {s.kind}
                      </Text>
                    </View>
                  </View>
                  <Text variant="body" style={{ lineHeight: 22 }}>
                    {s.body}
                  </Text>
                  <View style={styles.actions}>
                    <Button
                      size="sm"
                      variant="secondary"
                      style={{ flex: 1 }}
                      loading={review.isPending && activeReviewId === s.id && rejectingId === s.id}
                      disabled={review.isPending}
                      onPress={() => setRejectingId(s.id)}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      style={{ flex: 1 }}
                      loading={review.isPending && activeReviewId === s.id && rejectingId !== s.id}
                      disabled={review.isPending}
                      onPress={() => handleApprove(s.id)}
                    >
                      Approve
                    </Button>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      <RejectSuggestionSheet
        visible={rejectingId !== null}
        loading={review.isPending}
        onClose={() => setRejectingId(null)}
        onConfirm={handleRejectConfirm}
      />
    </SafeAreaView>
  );
}
