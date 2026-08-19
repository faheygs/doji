import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  Pressable,
  useWindowDimensions,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/useAuthStore';
import { getEquippedBorder } from '../../lib/cosmetics';
import { useSendFriendRequest } from '../../hooks/useProfile';
import { useTogglePollVoteLike } from '../../hooks/usePollVoteLikes';
import { ReportSheet } from './ReportSheet';
import { IconHeartSmall, IconMoreVertical } from '../icons/Icons';
import type { FeedAudience } from '../../lib/feedAudience';
import { isWouldYouRatherChallenge } from '../../lib/challengeDisplay';
import type { Challenge, PollOption } from '../../types/database';
import { createRequestSignal } from '../../lib/requestSignal';
import { scheduleQueryInvalidation } from '../../lib/queryInvalidationBatcher';
import { Motion } from '../../constants/motion';

type PollRow = PollOption & { liveCount: number; previewVoters: VoterRow[] };

type VoterRow = {
  user_id: string;
  vote_id?: string;
  created_at?: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  equipped_border_key: string | null;
  custom_text?: string | null;
  like_count?: number;
  my_like?: boolean;
  friendship_status?: 'self' | 'friends' | 'pending_out' | 'pending_in' | 'none';
};

type PollSnapshot = {
  rows: PollRow[];
  totalVotes: number;
  myVoteOptionId: string | null;
};

type PollSummaryRow = {
  option_id: string;
  challenge_id: string;
  option_text: string;
  option_position: number;
  option_is_other: boolean;
  option_created_at: string;
  vote_count: number;
  is_my_vote: boolean;
  preview_voters: VoterRow[];
};

type Props = {
  challenge: Challenge;
  dailyEventId: string;
  variant?: 'full' | 'embedded';
  fetchEnabled?: boolean;
  feedAudience?: FeedAudience;
};

const AVATAR_OVERLAP = 14;

const SPRING = { damping: 28, stiffness: 320, mass: 0.88 };

function PollResultCardImpl({
  challenge,
  dailyEventId,
  variant = 'full',
  fetchEnabled = true,
  feedAudience = 'everyone',
}: Props) {
  const { colors } = useTheme();
  const userId = useAuthStore((s) => s.session?.user?.id);
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const [voterModal, setVoterModal] = useState<{
    optionId: string; label: string; isOther: boolean; count: number;
  } | null>(null);
  const [voterVisible, setVoterVisible] = useState(false);
  const [reportVote, setReportVote] = useState<{ voteId: string; userId: string } | null>(null);
  const [reportVisible, setReportVisible] = useState(false);
  const pendingReportRef = useRef<{ voteId: string; userId: string } | null>(null);
  const isFriendsScope = feedAudience === 'friends';
  const modalOpen = voterVisible;

  const sendRequest = useSendFriendRequest();
  const toggleVoteLike = useTogglePollVoteLike();
  const queryClient = useQueryClient();

  const { data } = useQuery<PollSnapshot>({
    queryKey: ['pollResults', dailyEventId, feedAudience, userId],
    queryFn: async ({ signal }): Promise<PollSnapshot> => {
      const request = createRequestSignal(signal);
      const { data: summaryRows, error } = await (async () => {
        try {
          return await supabase
            .rpc('get_poll_results_summary', {
              p_daily_event_id: dailyEventId,
              p_audience: feedAudience,
            })
            .abortSignal(request.signal);
        } finally {
          request.cleanup();
        }
      })();
      if (error) throw error;
      const snapshotRows = (summaryRows ?? []) as PollSummaryRow[];
      let myVoteOptionId: string | null = null;
      const options: PollRow[] = snapshotRows.map((row) => {
        if (row.is_my_vote) myVoteOptionId = row.option_id;
        return {
          id: row.option_id,
          challenge_id: row.challenge_id,
          text: row.option_text,
          position: row.option_position,
          is_other: row.option_is_other,
          created_at: row.option_created_at,
          vote_count: row.vote_count,
          liveCount: row.vote_count,
          previewVoters: row.preview_voters ?? [],
        };
      });
      const visibleOptions = isWouldYouRatherChallenge(challenge)
        ? options.filter((option) => !option.is_other)
        : options;
      const rows = visibleOptions;
      const totalVotes = rows.reduce((s, r) => s + r.liveCount, 0);
      return { rows, totalVotes, myVoteOptionId };
    },
    enabled: fetchEnabled,
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });

  const rows: PollRow[] = data?.rows ?? [];
  const totalVotes = data?.totalVotes ?? 0;
  const effectiveMyVoteOptionId = data?.myVoteOptionId ?? null;

  const voterPages = useInfiniteQuery({
    queryKey: ['pollVotersDetail', dailyEventId, voterModal?.optionId, feedAudience, userId],
    queryFn: async ({ pageParam, signal }): Promise<VoterRow[]> => {
      const request = createRequestSignal(signal);
      try {
        const { data: page, error } = await supabase
          .rpc('get_poll_option_voters_page', {
            p_daily_event_id: dailyEventId,
            p_option_id: voterModal!.optionId,
            p_audience: feedAudience,
            p_limit: 40,
            p_before_created_at: pageParam?.createdAt ?? null,
            p_before_id: pageParam?.id ?? null,
          })
          .abortSignal(request.signal);
        if (error) throw error;
        return (page ?? []) as VoterRow[];
      } finally {
        request.cleanup();
      }
    },
    initialPageParam: null as { createdAt: string; id: string } | null,
    getNextPageParam: (last) => {
      const tail = last.at(-1);
      return last.length === 40 && tail?.created_at && tail.vote_id
        ? { createdAt: tail.created_at, id: tail.vote_id }
        : undefined;
    },
    enabled: modalOpen && Boolean(voterModal?.optionId),
    staleTime: 30_000,
  });

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: colors.surface,
          borderRadius: Radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          marginHorizontal: variant === 'full' ? Spacing.md : 0,
          marginBottom: variant === 'full' ? Spacing.md : Spacing.sm,
          padding: Spacing.md,
          gap: Spacing.sm,
        },
        header: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        },
        optionRow: {
          borderRadius: Radius.md,
          overflow: 'hidden',
          backgroundColor: colors.surfaceMuted,
          position: 'relative',
        },
        optionBar: {
          position: 'absolute',
          top: 0,
          left: 0,
          bottom: 0,
          borderRadius: Radius.md,
        },
        optionContent: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.sm + 2,
          gap: Spacing.sm,
        },
        avatarStack: {
          flexDirection: 'row',
          alignItems: 'center',
        },
        avatarWrap: {
          marginLeft: -AVATAR_OVERLAP,
          borderWidth: 2,
          borderColor: colors.surfaceMuted,
          borderRadius: 12,
          backgroundColor: colors.surfaceMuted,
        },
        morePill: {
          marginLeft: -AVATAR_OVERLAP,
          minWidth: 28,
          height: 24,
          borderRadius: 12,
          backgroundColor: colors.surface,
          borderWidth: 2,
          borderColor: colors.surfaceMuted,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 6,
        },
        footer: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: Spacing.xs,
        },
        /** Full-screen Modal host (no justify — matches PostCommentsSheet GestureHandlerRootView). */
        modalGestureRoot: {
          flex: 1,
        },
        /** Pins the sheet stack to the bottom of the Modal. */
        modalSheetHost: {
          flex: 1,
          justifyContent: 'flex-end',
        },
        /** Scrims sit on absolute layer only — not the same View as justifyContent:flex-end sheet. */
        modalBackdropTap: {
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: 'rgba(0,0,0,0.25)',
        },
        modalSheet: {
          backgroundColor: colors.surface,
          borderTopLeftRadius: Radius.lg,
          borderTopRightRadius: Radius.lg,
          borderWidth: 1,
          borderBottomWidth: 0,
          borderColor: colors.border,
          overflow: 'hidden',
        },
        sheetHandle: {
          alignSelf: 'center',
          width: 40,
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.textTertiary,
          opacity: 0.35,
          marginTop: Spacing.sm,
          marginBottom: Spacing.xs,
        },
        modalHeader: {
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.sm,
          paddingBottom: Spacing.md,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.hairline,
        },
        voterRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.md,
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.sm,
        },
        addBtn: { marginLeft: Spacing.xs },
      }),
    [colors, variant],
  );
  /** Fixed sheet height — same size every time, content scrolls inside. */
  const voterSheetMaxHeight = winH * 0.5;
  const voterListMaxHeight = Math.max(180, voterSheetMaxHeight - 120 - insets.bottom);

  /** Slide distance matches sheet height so dragging clears the panel entirely. */
  const sheetSlideRange = voterSheetMaxHeight + insets.bottom + 40;

  const sheetTranslateY = useSharedValue(sheetSlideRange);
  const panStartY = useSharedValue(0);
  const finishVoterDismiss = useCallback(() => {
    const pendingReport = pendingReportRef.current; pendingReportRef.current = null;
    setVoterModal(null);
    if (pendingReport) {
      setReportVote(pendingReport); setReportVisible(true);
    }
  }, []);
  const finalizeClose = useCallback(() => {
    Haptics.selectionAsync();
    setVoterVisible(false);
  }, []);
  const openVoters = useCallback((optionId: string, label: string, isOther: boolean, count: number) => {
    setVoterModal({ optionId, label, isOther, count }); setVoterVisible(true);
  }, []);

  useEffect(() => {
    if (!voterVisible && voterModal && Platform.OS !== 'ios') finishVoterDismiss();
  }, [finishVoterDismiss, voterModal, voterVisible]);

  useEffect(() => {
    if (modalOpen) {
      sheetTranslateY.value = sheetSlideRange;
      sheetTranslateY.value = withSpring(0, SPRING);
    } else {
      sheetTranslateY.value = sheetSlideRange;
    }
  }, [modalOpen, sheetSlideRange, sheetTranslateY]);

  const dismissWithSpring = useCallback(() => {
    sheetTranslateY.value = withTiming(sheetSlideRange, {
      duration: Motion.duration.content,
      easing: Easing.in(Easing.cubic),
    }, (finished) => {
      if (finished) runOnJS(finalizeClose)();
    });
  }, [finalizeClose, sheetSlideRange, sheetTranslateY]);

  const backdropOpacityStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      sheetTranslateY.value,
      [0, sheetSlideRange * 0.5, sheetSlideRange],
      [1, 0.45, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const sheetSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-8, 8])
        .failOffsetX([-28, 28])
        .onStart(() => {
          panStartY.value = sheetTranslateY.value;
        })
        .onUpdate((e) => {
          const next = Math.max(0, panStartY.value + e.translationY);
          sheetTranslateY.value = next;
        })
        .onEnd((e) => {
          const y = sheetTranslateY.value;
          const vy = e.velocityY;

          const threshold = sheetSlideRange * 0.22;

          if (vy > 700 || y > threshold) {
            sheetTranslateY.value = withTiming(sheetSlideRange, {
              duration: Motion.duration.content,
              easing: Easing.in(Easing.cubic),
            }, (finished) => {
              if (finished) runOnJS(finalizeClose)();
            });
            return;
          }

          sheetTranslateY.value = withSpring(0, SPRING);
        }),
    [finalizeClose, panStartY, sheetSlideRange, sheetTranslateY],
  );

  const modalVoters = voterPages.data?.pages.flat() ?? [];
  const modalIsOther = voterModal?.isOther ?? false;

  if (!fetchEnabled) {
    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <Text variant="headingMedium" numberOfLines={2} style={{ flex: 1, marginRight: Spacing.sm }}>
            {challenge.title}
          </Text>
        </View>
        <Text variant="bodySmall" color={colors.textTertiary}>
          Results unlock after you vote.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text variant="headingMedium" numberOfLines={2} style={{ flex: 1, marginRight: Spacing.sm }}>
          {challenge.title}
        </Text>
      </View>

      {rows.map((opt) => {
        const count = opt.liveCount;
        const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
        const isMyVote = effectiveMyVoteOptionId === opt.id;
        const barColor = isMyVote ? colors.primary : colors.textTertiary;
        const preview = opt.previewVoters;
        const extra = Math.max(0, count - preview.length);

        return (
          <View key={opt.id}>
            <TouchableOpacity
              style={styles.optionRow}
              activeOpacity={0.85}
              onPress={() => (count > 0 ? openVoters(opt.id, opt.text, Boolean(opt.is_other), count) : undefined)}
              accessibilityRole="button"
              accessibilityLabel={`${opt.text}, ${pct} percent.${count > 0 ? ' Tap to see voters.' : ''}`}
            >
              <View
                style={[
                  styles.optionBar,
                  {
                    width: `${pct}%`,
                    backgroundColor: `${barColor}20`,
                  },
                ]}
              />
              <View style={styles.optionContent}>
                <Text
                  variant="body"
                  color={isMyVote ? colors.primary : colors.text}
                  style={{ fontWeight: isMyVote ? '700' : '400', flex: 1 }}
                  numberOfLines={2}
                >
                  {opt.text}
                  {isMyVote ? ' ✓' : ''}
                </Text>
                {count > 0 ? (
                  <TouchableOpacity
                    onPress={() => openVoters(opt.id, opt.text, Boolean(opt.is_other), count)}
                    hitSlop={8}
                    style={styles.avatarStack}
                    accessibilityRole="button"
                    accessibilityLabel={`${count} voters for ${opt.text}`}
                  >
                    {preview.map((v, i) => (
                      <View
                        key={v.user_id}
                        style={[styles.avatarWrap, i === 0 ? { marginLeft: 0 } : null]}
                      >
                        <Avatar uri={v.avatar_url} username={v.username} size={24} />
                      </View>
                    ))}
                    {extra > 0 ? (
                      <View style={styles.morePill}>
                        <Text variant="nano" color={colors.textSecondary}>
                          +{extra}
                        </Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                ) : null}
                <Text variant="label" color={colors.textSecondary}>
                  {pct}%
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        );
      })}

      <View style={styles.footer}>
        <Text variant="micro" color={colors.textTertiary}>
          {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
          {isFriendsScope ? ' from friends' : ''}
        </Text>
        <Text variant="micro" color={colors.textTertiary}>
          +{challenge.xp_reward} XP
        </Text>
      </View>

      {voterModal ? <Modal
        visible={voterVisible}
        transparent
        animationType="none"
        statusBarTranslucent={Platform.OS === 'android'}
        onRequestClose={dismissWithSpring}
        onDismiss={finishVoterDismiss}
      >
        <GestureHandlerRootView style={styles.modalGestureRoot}>
          <Animated.View
            pointerEvents="box-none"
            style={[StyleSheet.absoluteFill, styles.modalBackdropTap, backdropOpacityStyle]}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={dismissWithSpring}
              accessibilityRole="button"
              accessibilityLabel="Dismiss voter list"
            />
          </Animated.View>

          <View pointerEvents="box-none" style={styles.modalSheetHost}>
            <Animated.View
              style={[
                styles.modalSheet,
                sheetSlideStyle,
                {
                  height: voterSheetMaxHeight,
                  paddingBottom: insets.bottom + Spacing.sm,
                },
              ]}
            >
              <GestureDetector gesture={panGesture}>
                <View>
                  <View style={styles.sheetHandle} />
                  <View style={styles.modalHeader}>
                    <Text variant="headingMedium" numberOfLines={3}>
                      {voterModal?.label}
                    </Text>
                    <Text variant="micro" color={colors.textTertiary} style={{ marginTop: 4 }}>
                       {voterModal.count} {voterModal.count === 1 ? 'vote' : 'votes'}
                    </Text>
                  </View>
                </View>
              </GestureDetector>
              <FlatList
                data={modalVoters}
                keyExtractor={(item) => item.user_id}
                style={{ flex: 1 }}
                contentContainerStyle={{
                  paddingBottom: Spacing.md,
                  flexGrow: modalVoters.length === 0 ? 1 : 0,
                }}
                initialNumToRender={20}
                windowSize={10}
                onEndReached={() => {
                  if (voterPages.hasNextPage && !voterPages.isFetchingNextPage) {
                    void voterPages.fetchNextPage();
                  }
                }}
                onEndReachedThreshold={0.4}
                ListFooterComponent={
                  voterPages.isFetchingNextPage ? <ActivityIndicator color={colors.primary} /> : null
                }
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const border = getEquippedBorder(item);
                  const isMe = item.user_id === userId;
                  const isFriend = item.friendship_status === 'friends';
                  const isPending = item.friendship_status === 'pending_out';
                  const canAdd = !isMe && !isFriend;
                   const isLiked = item.my_like === true;
                   const likeCount = item.like_count ?? 0;
                  return (
                    <View style={styles.voterRow}>
                      <Avatar
                        uri={item.avatar_url}
                        username={item.username}
                        size={40}
                        borderColor={border?.color}
                        borderWidth={border?.width}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="body" numberOfLines={1}>
                          {item.display_name?.trim() || item.username}
                        </Text>
                        <Text variant="micro" color={colors.textTertiary} numberOfLines={1}>
                          @{item.username}
                        </Text>
                        {modalIsOther && item.custom_text?.trim() ? (
                          <Text variant="bodySmall" color={colors.textSecondary} numberOfLines={2} style={{ marginTop: 2 }}>
                            "{item.custom_text.trim()}"
                          </Text>
                        ) : null}
                      </View>
                      {canAdd ? (
                        <Button
                          size="sm"
                          variant={isPending ? 'ghost' : 'primary'}
                          style={styles.addBtn}
                          disabled={isPending || sendRequest.isPending}
                          onPress={() => {
                            if (isPending) return;
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            sendRequest.mutate({ addresseeId: item.user_id }, {
                              onSuccess: () => {
                                scheduleQueryInvalidation(queryClient, ['pollVotersDetail', 'friendship']);
                              },
                            });
                          }}
                        >
                          {isPending ? 'Pending' : '+ Friend'}
                        </Button>
                      ) : null}
                      {modalIsOther && item.vote_id ? (
                        <View style={{ alignItems: 'center', gap: 2, paddingLeft: Spacing.xs }}>
                          <TouchableOpacity
                            onPress={() => {
                              if (toggleVoteLike.isPending) return;
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              toggleVoteLike.mutate({ pollVoteId: item.vote_id!, liked: isLiked });
                            }}
                            disabled={toggleVoteLike.isPending}
                            accessibilityRole="button"
                            accessibilityLabel={isLiked ? 'Unlike this answer' : 'Like this answer'}
                          >
                            <IconHeartSmall size={18} color={isLiked ? colors.danger : colors.textTertiary} filled={isLiked} />
                          </TouchableOpacity>
                          {likeCount > 0 ? (
                            <Text variant="nano" color={colors.textTertiary}>
                              {likeCount}
                            </Text>
                          ) : null}
                        </View>
                      ) : null}
                      {modalIsOther && !isMe && item.vote_id ? (
                        <TouchableOpacity
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                             pendingReportRef.current = { voteId: item.vote_id!, userId: item.user_id };
                             dismissWithSpring();
                          }}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel="Report this answer"
                          style={{ paddingLeft: Spacing.xs }}
                        >
                          <IconMoreVertical size={16} color={colors.textTertiary} />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  );
                }}
              />
            </Animated.View>
          </View>
        </GestureHandlerRootView>
      </Modal> : null}

      {reportVote ? (
        <ReportSheet
          visible={reportVisible}
          reportedUserId={reportVote.userId}
          pollVoteId={reportVote.voteId}
          onClose={() => setReportVisible(false)}
        />
      ) : null}
    </View>
  );
}

export const PollResultCard = React.memo(PollResultCardImpl);
