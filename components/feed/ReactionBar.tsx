import React, { useMemo, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';
import { REACTION_CONTROLS, IconComment } from '../icons/Icons';
import { useToggleReaction } from '../../hooks/useFeed';
import { reactionEmojiIconColors } from '../../lib/reactionColors';
import { formatCompactCount } from '../../utils/formatCount';
import type { Post, ReactionEmoji } from '../../types/database';

const ICON_SZ = 22;

type Props = {
  post: Post;
  blurred: boolean;
  showTopBorder?: boolean;
  onOpenComments: () => void;
};

function breakdownSig(post: Post): string {
  return Object.entries(post.reaction_breakdown ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join('|');
}

function myReactionsSig(post: Post): string {
  return (post.my_reactions ?? []).sort().join(',');
}

function ReactionBarImpl({ post, blurred, showTopBorder = true, onOpenComments }: Props) {
  const { colors } = useTheme();
  const toggleReaction = useToggleReaction();
  const myReactions = post.my_reactions ?? [];
  const emojiTints = useMemo(() => reactionEmojiIconColors(colors), [colors]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          paddingHorizontal: Spacing.md,
          paddingBottom: Spacing.sm + 2,
          paddingTop: showTopBorder ? Spacing.sm : Spacing.xs,
          flexDirection: 'row',
          alignItems: 'center',
          borderTopWidth: showTopBorder ? StyleSheet.hairlineWidth : 0,
          borderTopColor: colors.hairline,
        },
        reactions: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          minWidth: 0,
        },
        commentCol: {
          alignItems: 'center',
          justifyContent: 'center',
          paddingLeft: Spacing.xs,
          marginLeft: Spacing.xs,
          borderLeftWidth: StyleSheet.hairlineWidth,
          borderLeftColor: colors.hairline,
          gap: 4,
          minWidth: 44,
        },
        commentHit: {
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 4,
          paddingVertical: 4,
          borderRadius: Radius.full,
        },
        commentCount: {
          fontSize: 12,
          fontWeight: '600',
          fontVariant: ['tabular-nums'],
          textAlign: 'center',
          lineHeight: 14,
        },
        emojiCol: {
          flex: 1,
          minWidth: 0,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        },
        iconButton: {
          paddingHorizontal: Spacing.xs,
          paddingVertical: 6,
          borderRadius: Radius.full,
          borderWidth: 1.5,
          borderColor: 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: ICON_SZ + 12,
          minWidth: ICON_SZ + 12,
        },
        iconSelected: {
          backgroundColor: colors.surfaceMuted,
          borderColor: colors.primary,
        },
        count: {
          fontSize: 12,
          fontWeight: '600',
          fontVariant: ['tabular-nums'],
          textAlign: 'center',
          lineHeight: 14,
        },
        disabled: {
          opacity: 0.35,
        },
      }),
    [colors, showTopBorder],
  );

  const handleReact = useCallback(
    (emoji: ReactionEmoji) => {
      if (blurred) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const active = myReactions.includes(emoji);
      toggleReaction.mutate({ postId: post.id, emoji, active });
    },
    [blurred, myReactions, post.id, toggleReaction],
  );

  const openComments = useCallback(() => {
    if (blurred) return;
    Haptics.selectionAsync();
    onOpenComments();
  }, [blurred, onOpenComments]);

  const commentMuted = blurred ? colors.textTertiary : colors.textSecondary;

  return (
    <View style={styles.container}>
      <View style={styles.reactions}>
        {REACTION_CONTROLS.map(({ emoji, Icon, label }) => {
          const selected = myReactions.includes(emoji as ReactionEmoji);
          const muted = blurred ? colors.textTertiary : colors.textSecondary;
          const iconColor = blurred ? muted : selected ? (emojiTints[emoji] ?? colors.primary) : muted;
          const count = (post.reaction_breakdown as Record<string, number> | undefined)?.[emoji] ?? 0;
          return (
            <View key={emoji} style={styles.emojiCol}>
              <TouchableOpacity
                onPress={() => handleReact(emoji as ReactionEmoji)}
                activeOpacity={blurred ? 1 : 0.72}
                accessibilityRole="button"
                accessibilityLabel={`${label} reaction, ${count}. ${selected ? 'Selected.' : ''}`}
                style={[
                  styles.iconButton,
                  selected && styles.iconSelected,
                  blurred && styles.disabled,
                ]}
              >
                <Icon size={ICON_SZ} color={iconColor} />
              </TouchableOpacity>
              <Text
                variant="bodySmall"
                color={count > 0 ? colors.textSecondary : colors.textTertiary}
                style={styles.count}
              >
                {count}
              </Text>
            </View>
          );
        })}
      </View>
      <TouchableOpacity
        onPress={openComments}
        activeOpacity={blurred ? 1 : 0.72}
        disabled={blurred}
        style={[styles.commentCol, blurred && styles.disabled]}
        accessibilityRole="button"
        accessibilityLabel={`Comments, ${post.comment_count}. Open comments.`}
      >
        <View style={styles.commentHit}>
          <IconComment size={ICON_SZ} color={commentMuted} />
        </View>
        <Text
          variant="bodySmall"
          color={post.comment_count > 0 ? colors.textSecondary : colors.textTertiary}
          style={styles.commentCount}
        >
          {formatCompactCount(post.comment_count)}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export const ReactionBar = React.memo(ReactionBarImpl, (prev, next) => {
  if (prev.onOpenComments !== next.onOpenComments) return false;
  if (prev.blurred !== next.blurred || prev.post.id !== next.post.id) return false;
  if (prev.showTopBorder !== next.showTopBorder) return false;
  if (prev.post.reaction_count !== next.post.reaction_count) return false;
  if (prev.post.comment_count !== next.post.comment_count) return false;
  if (myReactionsSig(prev.post) !== myReactionsSig(next.post)) return false;
  if (breakdownSig(prev.post) !== breakdownSig(next.post)) return false;
  return true;
});
