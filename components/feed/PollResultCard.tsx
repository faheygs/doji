import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  Pressable,
  useWindowDimensions,
  Platform,
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
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDemoStore } from '../../stores/useDemoStore';
import { DEMO_OPTIONS_BY_CHALLENGE, DEMO_TOTAL_VOTES_BY_CHALLENGE } from '../../constants/demoData';
import { getFriendIdsIncludingSelf } from '../../lib/friendGraph';
import { getEquippedBorder } from '../../lib/cosmetics';
import { useSendFriendRequest } from '../../hooks/useProfile';
import type { FeedAudience } from '../../lib/feedAudience';
import type { Challenge, PollOption } from '../../types/database';

type PollRow = PollOption & { liveCount: number };

type VoterRow = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  equipped_border_key: string | null;
  custom_text?: string | null;
};

type Props = {
  challenge: Challenge;
  variant?: 'full' | 'embedded';
  fetchEnabled?: boolean;
  feedAudience?: FeedAudience;
};

const AVATAR_OVERLAP = 14;

const SPRING = { damping: 28, stiffness: 320, mass: 0.88 };

function PollResultCardImpl({
  challenge,
  variant = 'full',
  fetchEnabled = true,
  feedAudience = 'everyone',
}: Props) {
  const { colors } = useTheme();
  const userId = useAuthStore((s) => s.session?.user?.id);
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const [voterModal, setVoterModal] = useState<{ optionId: string; label: string } | null>(null);
  const isFriendsScope = feedAudience === 'friends';

  const { data: friendIds = [], isFetched: friendIdsReady } = useQuery({
    queryKey: ['friendIds', userId],
    queryFn: () => getFriendIdsIncludingSelf(userId!),
    enabled: !isDemoMode && !!userId && fetchEnabled,
    staleTime: 30_000,
  });

  const { data: pendingRequests = [] } = useQuery({
    queryKey: ['pendingRequests', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data } = await supabase
        .from('friendships')
        .select('addressee_id')
        .eq('requester_id', userId)
        .eq('status', 'pending');
      return (data ?? []).map((r) => r.addressee_id as string);
    },
    enabled: !isDemoMode && !!userId && fetchEnabled,
    staleTime: 30_000,
  });

  const sendRequest = useSendFriendRequest();
  const queryClient = useQueryClient();

  const scopeUserIds = isFriendsScope ? friendIds : undefined;
  const scopeKey = scopeUserIds?.slice().sort().join(',') ?? 'all';
  const scopeReady = !isFriendsScope || friendIdsReady;

  const { data } = useQuery({
    queryKey: ['pollResults', challenge.id, feedAudience, scopeKey],
    queryFn: async (): Promise<{ rows: PollRow[]; totalVotes: number }> => {
      const [{ data: options, error: optErr }, { data: votes, error: voteErr }] = await Promise.all([
        supabase
          .from('poll_options')
          .select('*')
          .eq('challenge_id', challenge.id)
          .order('position', { ascending: true }),
        scopeUserIds
          ? supabase
              .from('poll_votes')
              .select('option_id')
              .eq('challenge_id', challenge.id)
              .in('user_id', scopeUserIds)
          : supabase.from('poll_votes').select('option_id').eq('challenge_id', challenge.id),
      ]);
      if (optErr) throw optErr;
      if (voteErr) throw voteErr;

      const counts = new Map<string, number>();
      for (const row of votes ?? []) {
        const id = row.option_id as string;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }

      const rows: PollRow[] = (options ?? []).map((o) => ({
        ...(o as PollOption),
        liveCount: counts.get(o.id) ?? 0,
      }));
      const totalVotes = rows.reduce((s, r) => s + r.liveCount, 0);
      return { rows, totalVotes };
    },
    enabled: !isDemoMode && fetchEnabled && scopeReady,
    staleTime: 30_000,
  });

  const rows: PollRow[] = isDemoMode ? (DEMO_OPTIONS_BY_CHALLENGE[challenge.id] ?? []) : (data?.rows ?? []);
  const totalVotes = isDemoMode ? (DEMO_TOTAL_VOTES_BY_CHALLENGE[challenge.id] ?? 0) : (data?.totalVotes ?? 0);

  const demoVoteOptionId = useDemoStore((s) => s.demoVotesByChallenge[challenge.id] ?? null);

  const { data: myVoteOptionId } = useQuery<string | null>({
    queryKey: ['myPollVote', challenge.id, userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('poll_votes')
        .select('option_id')
        .eq('challenge_id', challenge.id)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return data?.option_id ?? null;
    },
    enabled: !isDemoMode && !!userId && fetchEnabled,
  });

  const effectiveMyVoteOptionId = isDemoMode ? demoVoteOptionId : (myVoteOptionId ?? null);

  const demoPollVotersMap = useMemo(() => {
    if (!isDemoMode) return null;
    const opts = DEMO_OPTIONS_BY_CHALLENGE[challenge.id] ?? [];
    const m = new Map<string, VoterRow[]>();
    for (const opt of opts) {
      m.set(opt.id, opt.voters);
    }
    return m;
  }, [isDemoMode, challenge.id]);

  const { data: votersByOption } = useQuery({
    queryKey: ['pollVotersDetail', challenge.id, feedAudience, scopeKey],
    queryFn: async () => {
      let voteQuery = supabase
        .from('poll_votes')
        .select('option_id, user_id, custom_text')
        .eq('challenge_id', challenge.id);
      if (scopeUserIds) {
        voteQuery = voteQuery.in('user_id', scopeUserIds);
      }
      const { data: voteRows, error } = await voteQuery;
      if (error) throw error;
      const userIds = [...new Set((voteRows ?? []).map((r) => r.user_id as string))];
      let profileById = new Map<
        string,
        { username: string; display_name: string | null; avatar_url: string | null; equipped_border_key: string | null }
      >();
      if (userIds.length > 0) {
        const { data: profs, error: pErr } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, equipped_border_key')
          .in('id', userIds);
        if (pErr) throw pErr;
        for (const p of profs ?? []) {
          profileById.set(p.id as string, {
            username: p.username as string,
            display_name: (p.display_name as string | null) ?? null,
            avatar_url: (p.avatar_url as string | null) ?? null,
            equipped_border_key: (p.equipped_border_key as string | null) ?? null,
          });
        }
      }
      const m = new Map<string, VoterRow[]>();
      for (const row of voteRows ?? []) {
        const oid = row.option_id as string;
        const uid = row.user_id as string;
        const p = profileById.get(uid);
        const list = m.get(oid) ?? [];
        list.push({
          user_id: uid,
          username: p?.username ?? 'user',
          display_name: p?.display_name ?? null,
          avatar_url: p?.avatar_url ?? null,
          equipped_border_key: p?.equipped_border_key ?? null,
          custom_text: (row.custom_text as string | null) ?? null,
        });
        m.set(oid, list);
      }
      return m;
    },
    enabled: !isDemoMode && fetchEnabled && scopeReady,
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
          ...StyleSheet.absoluteFillObject,
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

  const modalOpen = Boolean(voterModal);

  const finalizeClose = useCallback(() => {
    Haptics.selectionAsync();
    setVoterModal(null);
  }, []);

  const openVoters = useCallback((optionId: string, label: string) => {
    setVoterModal({ optionId, label });
  }, []);

  useEffect(() => {
    if (modalOpen) {
      sheetTranslateY.value = sheetSlideRange;
      sheetTranslateY.value = withSpring(0, SPRING);
    } else {
      sheetTranslateY.value = sheetSlideRange;
    }
  }, [modalOpen, sheetSlideRange, sheetTranslateY]);

  const dismissWithSpring = useCallback(() => {
    sheetTranslateY.value = withSpring(sheetSlideRange, SPRING, (finished) => {
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
            sheetTranslateY.value = withSpring(sheetSlideRange, SPRING, (finished) => {
              if (finished) runOnJS(finalizeClose)();
            });
            return;
          }

          sheetTranslateY.value = withSpring(0, SPRING);
        }),
    [finalizeClose, panStartY, sheetSlideRange, sheetTranslateY],
  );

  const effectiveVotersByOption = isDemoMode ? demoPollVotersMap : (votersByOption ?? null);
  const modalVoters = voterModal ? (effectiveVotersByOption?.get(voterModal.optionId) ?? []) : [];
  const modalIsOther = rows.some((r) => r.id === voterModal?.optionId && r.is_other);

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
        const voters = effectiveVotersByOption?.get(opt.id) ?? [];
        const preview = voters.slice(0, 4);
        const extra = Math.max(0, voters.length - 4);

        return (
          <View key={opt.id}>
            <TouchableOpacity
              style={styles.optionRow}
              activeOpacity={0.85}
              onPress={() => (count > 0 ? openVoters(opt.id, opt.text) : undefined)}
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
                    onPress={() => openVoters(opt.id, opt.text)}
                    hitSlop={8}
                    style={styles.avatarStack}
                    accessibilityRole="button"
                    accessibilityLabel={`${voters.length} voters for ${opt.text}`}
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

      <Modal
        visible={modalOpen}
        transparent
        animationType="none"
        statusBarTranslucent={Platform.OS === 'android'}
        onRequestClose={dismissWithSpring}
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
                      {modalVoters.length} {modalVoters.length === 1 ? 'vote' : 'votes'}
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
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const border = getEquippedBorder(item);
                  const isMe = item.user_id === userId;
                  const isFriend = friendIds.includes(item.user_id);
                  const isPending = pendingRequests.includes(item.user_id);
                  const canAdd = !isMe && !isFriend;
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
                            sendRequest.mutate(item.user_id, {
                              onSuccess: () => {
                                void queryClient.invalidateQueries({ queryKey: ['pendingRequests', userId] });
                                void queryClient.invalidateQueries({ queryKey: ['friendIds', userId] });
                              },
                            });
                          }}
                        >
                          {isPending ? 'Pending' : '+ Friend'}
                        </Button>
                      ) : null}
                    </View>
                  );
                }}
              />
            </Animated.View>
          </View>
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
}

export const PollResultCard = React.memo(PollResultCardImpl);
