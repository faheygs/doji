import React, { useMemo, useCallback, useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { Spacing, webScrollParentStyle } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { KeyboardSafeSheet } from '@/components/ui/KeyboardSafeSheet';
import { ErrorState } from '@/components/ui/ErrorState';
import { ListRowsSkeleton } from '@/components/ui/LoadingSkeletons';
import { SkeletonSwap } from '@/components/ui/SkeletonSwap';
import { IconChevronLeft } from '@/components/icons/Icons';
import { usePendingSuggestions, useReviewSuggestion } from '@/hooks/useSuggestions';
import { goBackToExplicitReturn } from '@/lib/navigationReturn';
import { SuggestionReviewSheet } from '@/components/admin/SuggestionReviewSheet';
import type { ChallengeSuggestion } from '@/types/database';
import { SuggestionQueueCard } from '@/components/admin/SuggestionQueueCard';
import { AdminQueueEmptyState } from '@/components/admin/AdminQueueEmptyState';
import { InlineFeedback } from '@/components/ui/InlineFeedback';

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
    refetch,
    isRefetching,
  } = usePendingSuggestions();
  const coldError = isError && suggestions.length === 0;
  const review = useReviewSuggestion();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState<ChallengeSuggestion | null>(null);
  const [reviewError, setReviewError] = useState('');

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
      }),
    [colors],
  );

  const handleApprove = useCallback(
    (id: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setReviewError('');
      setActiveReviewId(id);
      review.mutate(
        { id, status: 'approved' },
        {
          onSuccess: () => {
            Toast.show({ type: 'success', text1: 'Suggestion approved' });
          },
          onError: () => setReviewError('Could not approve this suggestion. Try again.'),
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
      setReviewError('');
      setActiveReviewId(rejectingId);
      review.mutate(
        { id: rejectingId, status: 'rejected', adminNote: note || null },
        {
          onSuccess: () => {
            setRejectingId(null);
            Toast.show({ type: 'success', text1: 'Suggestion rejected' });
          },
          onError: () => setReviewError('Could not reject this suggestion. Try again.'),
          onSettled: () => setActiveReviewId(null),
        },
      );
    },
    [rejectingId, review],
  );

  const handleBack = useCallback(() => {
    goBackToExplicitReturn(
      router,
      returnTo ?? '/(app)/profile/settings',
      '/(app)/profile/settings' as Href,
    );
  }, [router, returnTo]);

  return (
    <SafeAreaView style={[styles.container, webScrollParentStyle]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} hitSlop={12} accessibilityLabel="Back">
          <IconChevronLeft size={26} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text variant="headingLarge">Pending suggestions</Text>
          {!isLoading && !coldError ? (
            <Text variant="micro" color={colors.textTertiary}>
              {suggestions.length === 0
                ? 'Queue is empty'
                : `${suggestions.length} awaiting review`}
            </Text>
          ) : null}
        </View>
      </View>

      <SkeletonSwap
        loading={isLoading && suggestions.length === 0}
        skeleton={<ListRowsSkeleton rows={3} label="Loading pending suggestions" />}
      >
        {coldError ? (
          <ErrorState
            title="Couldn't load suggestions"
            message="We couldn't reach the review queue. Try again in a moment."
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
            {reviewError ? (
              <InlineFeedback
                title="Review did not update"
                message={reviewError}
                style={{ marginHorizontal: Spacing.md, marginBottom: Spacing.md }}
              />
            ) : null}
            {suggestions.length === 0 ? (
              <AdminQueueEmptyState
                title="No suggestions to review"
                message="New challenge ideas will appear here when someone submits one."
              />
            ) : suggestions.map((s) => (
                <SuggestionQueueCard
                  key={s.id}
                  suggestion={s}
                  busy={review.isPending}
                  approving={review.isPending && activeReviewId === s.id && rejectingId !== s.id}
                  rejecting={review.isPending && activeReviewId === s.id && rejectingId === s.id}
                  onOpen={() => setSelectedSuggestion(s)}
                  onReject={() => setRejectingId(s.id)}
                  onApprove={() => handleApprove(s.id)}
                />
              ))}
          </ScrollView>
        )}
      </SkeletonSwap>

      <RejectSuggestionSheet
        visible={rejectingId !== null}
        loading={review.isPending}
        onClose={() => setRejectingId(null)}
        onConfirm={handleRejectConfirm}
      />
      <SuggestionReviewSheet
        suggestion={selectedSuggestion}
        busy={review.isPending}
        onApprove={() => {
          if (!selectedSuggestion) return;
          handleApprove(selectedSuggestion.id);
          setSelectedSuggestion(null);
        }}
        onReject={() => {
          if (!selectedSuggestion) return;
          setRejectingId(selectedSuggestion.id);
          setSelectedSuggestion(null);
        }}
        onClose={() => setSelectedSuggestion(null)}
      />
    </SafeAreaView>
  );
}
