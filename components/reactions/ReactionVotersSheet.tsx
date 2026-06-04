import React, { useMemo, useCallback } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';
import { Avatar } from '../ui/Avatar';
import { IconClose, REACTION_CONTROLS, ReactionIcon } from '../icons/Icons';
import { reactionEmojiIconColors } from '../../lib/reactionColors';
import { normalizeReactionEmoji } from '../../lib/reactionEmoji';
import { getEquippedBorder } from '../../lib/cosmetics';
import { hrefWithReturnTo } from '../../lib/navigationReturn';
import { usePostReactions } from '../../hooks/useFeed';
import { getFriendIdsIncludingSelf } from '../../lib/friendGraph';
import { useAuthStore } from '../../stores/useAuthStore';
import type { FeedAudience } from '../../lib/feedAudience';
import type { Reaction, ReactionEmoji } from '../../types/database';

type Props = {
  visible: boolean;
  postId: string;
  emojiFilter?: ReactionEmoji | null;
  feedAudience?: FeedAudience;
  onClose: () => void;
};

function reactionLabel(emoji: ReactionEmoji): string {
  const key = normalizeReactionEmoji(emoji) ?? emoji;
  return REACTION_CONTROLS.find((r) => r.emoji === key)?.label ?? emoji;
}

export function ReactionVotersSheet({
  visible,
  postId,
  emojiFilter,
  feedAudience = 'everyone',
  onClose,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const userId = useAuthStore((s) => s.session?.user?.id);
  const isFriendsScope = feedAudience === 'friends';

  const { data: friendIds = [], isFetched: friendIdsReady } = useQuery({
    queryKey: ['friendIds', userId],
    queryFn: () => getFriendIdsIncludingSelf(userId!),
    enabled: visible && isFriendsScope && !!userId,
    staleTime: 30_000,
  });

  const scopeUserIds = isFriendsScope ? friendIds : undefined;
  const scopeReady = !isFriendsScope || friendIdsReady;

  const { data, isPending, isFetchingNextPage, fetchNextPage, hasNextPage } = usePostReactions(
    visible && scopeReady ? postId : '',
    scopeUserIds,
  );

  const allReactions = useMemo(
    () => (data?.pages ?? []).flatMap((page) => page),
    [data?.pages],
  );

  const reactions = useMemo(() => {
    if (!emojiFilter) return allReactions;
    return allReactions.filter((r) => {
      if (!emojiFilter) return true;
      const normalized = normalizeReactionEmoji(r.emoji);
      const filter = normalizeReactionEmoji(emojiFilter) ?? emojiFilter;
      return normalized === filter || r.emoji === emojiFilter;
    });
  }, [allReactions, emojiFilter]);

  const winH = Dimensions.get('window').height;

  const handleClose = useCallback(() => {
    Haptics.selectionAsync();
    onClose();
  }, [onClose]);

  const openProfile = useCallback(
    (username: string | undefined) => {
      if (!username) return;
      Haptics.selectionAsync();
      handleClose();
      router.push(hrefWithReturnTo(`/(app)/member/${username}`, pathname));
    },
    [handleClose, pathname, router],
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          justifyContent: 'flex-end',
        },
        scrim: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(0,0,0,0.25)',
        },
        sheet: {
          maxHeight: winH * 0.72,
          minHeight: 220,
          backgroundColor: colors.surface,
          borderTopLeftRadius: Radius.lg,
          borderTopRightRadius: Radius.lg,
          paddingTop: Spacing.sm,
          borderWidth: StyleSheet.hairlineWidth,
          borderBottomWidth: 0,
          borderColor: colors.border,
        },
        grab: {
          alignSelf: 'center',
          width: 42,
          height: 5,
          borderRadius: 3,
          backgroundColor: colors.textTertiary,
          opacity: 0.4,
          marginBottom: Spacing.sm,
        },
        headRow: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: Spacing.md,
          paddingBottom: Spacing.sm,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.hairline,
        },
        title: { flex: 1 },
        closeHit: { padding: Spacing.xs },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.sm + 2,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.hairline,
        },
        rowBody: { flex: 1, minWidth: 0 },
        emojiBadge: {
          width: 28,
          alignItems: 'center',
          justifyContent: 'center',
        },
        centered: {
          padding: Spacing.xl,
          alignItems: 'center',
        },
        footer: {
          paddingVertical: Spacing.sm,
          alignItems: 'center',
        },
      }),
    [colors, winH],
  );

  const title = emojiFilter
    ? `${reactionLabel(emojiFilter)} · ${reactions.length}${hasNextPage ? '+' : ''}`
    : `Reactions · ${reactions.length}${hasNextPage ? '+' : ''}`;
  const scopedTitle = isFriendsScope ? `${title} · friends` : title;

  const renderItem = useCallback(
    ({ item }: { item: Reaction }) => {
      const username = item.profile?.username ?? 'unknown';
      const tints = reactionEmojiIconColors(colors);
      return (
        <TouchableOpacity
          style={styles.row}
          onPress={() => openProfile(item.profile?.username)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={`@${username}`}
        >
          {(() => {
            const border = getEquippedBorder(item.profile);
            return (
              <Avatar
                uri={item.profile?.avatar_url}
                username={username}
                size={40}
                borderColor={border?.color}
                borderWidth={border?.width}
              />
            );
          })()}
          <View style={styles.rowBody}>
            <Text variant="body" numberOfLines={1} style={{ fontWeight: '600' }}>
              @{username}
            </Text>
          </View>
          <View style={styles.emojiBadge}>
            <ReactionIcon
              emoji={item.emoji}
              size={20}
              color={tints[item.emoji] ?? colors.textSecondary}
              filled
            />
          </View>
        </TouchableOpacity>
      );
    },
    [colors, openProfile, styles.emojiBadge, styles.row, styles.rowBody],
  );

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.scrim} onPress={handleClose} accessibilityLabel="Dismiss" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.sm }]}>
          <View style={styles.grab} />
          <View style={styles.headRow}>
            <Text variant="headingMedium" numberOfLines={1} style={styles.title}>
              {scopedTitle}
            </Text>
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={12}
              style={styles.closeHit}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <IconClose size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {isPending ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.text} />
            </View>
          ) : reactions.length === 0 ? (
            <View style={styles.centered}>
              <Text variant="body" color={colors.textSecondary}>
                {isFriendsScope ? 'No reactions from friends yet.' : 'No reactions yet.'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={reactions}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              onEndReached={() => {
                if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
              }}
              onEndReachedThreshold={0.4}
              ListFooterComponent={
                isFetchingNextPage ? (
                  <View style={styles.footer}>
                    <ActivityIndicator color={colors.textSecondary} size="small" />
                  </View>
                ) : null
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
}
