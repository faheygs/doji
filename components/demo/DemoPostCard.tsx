import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';
import type { ChallengeType } from '../../types/database';

export type DemoPost = {
  id: string;
  type: ChallengeType;
  challengeTitle: string;
  username: string;
  displayName: string;
  gradientColors: [string, string];
  photoUrl: string | null;
  caption: string | null;
  pollOptions?: { text: string; percent: number }[];
  selectedOption?: number;
  reactionCounts: Partial<Record<string, number>>;
  comments: { username: string; text: string }[];
};

type Props = {
  post: DemoPost;
};

const TYPE_LABELS: Record<ChallengeType, string> = {
  photo: '📸 Photo',
  poll: '📊 Poll',
  task: '📝 Task',
  format: '✍️ Format',
};

const REACTION_EMOJIS = ['fire', 'heart', 'wow', 'like'] as const;
const REACTION_CHARS: Record<string, string> = {
  fire: '🔥',
  heart: '❤️',
  wow: '😮',
  like: '👍',
};

export function DemoPostCard({ post }: Props) {
  const { colors } = useTheme();
  const [localReactions, setLocalReactions] = useState(post.reactionCounts);
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [localComments, setLocalComments] = useState(post.comments);
  const [newComment, setNewComment] = useState('');

  const handleReaction = (emoji: string) => {
    setLocalReactions((prev) => {
      const current = prev[emoji] ?? 0;
      if (myReaction === emoji) {
        setMyReaction(null);
        return { ...prev, [emoji]: Math.max(0, current - 1) };
      }
      const next = { ...prev, [emoji]: current + 1 };
      if (myReaction) next[myReaction] = Math.max(0, (next[myReaction] ?? 1) - 1);
      setMyReaction(emoji);
      return next;
    });
  };

  const handleAddComment = () => {
    const trimmed = newComment.trim();
    if (!trimmed) return;
    setLocalComments((prev) => [...prev, { username: 'you', text: trimmed }]);
    setNewComment('');
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      {/* Header */}
      <View style={styles.header}>
        <LinearGradient colors={post.gradientColors} style={styles.avatar}>
          <Text style={styles.avatarInitial}>{post.displayName[0]}</Text>
        </LinearGradient>
        <View style={styles.headerText}>
          <Text variant="label" color={colors.text}>
            {post.displayName}
          </Text>
          <Text variant="bodySmall" color={colors.textSecondary}>
            @{post.username}
          </Text>
        </View>
        <View style={[styles.typeBadge, { backgroundColor: `${colors.primary}18` }]}>
          <Text variant="micro" color={colors.primary} style={styles.typeBadgeText}>
            {TYPE_LABELS[post.type]}
          </Text>
        </View>
      </View>

      {/* Photo */}
      {post.photoUrl ? (
        <Image
          source={{ uri: post.photoUrl }}
          style={styles.photo}
          contentFit="cover"
          recyclingKey={post.id}
        />
      ) : null}

      {/* Poll options */}
      {post.type === 'poll' && post.pollOptions ? (
        <View style={styles.pollContainer}>
          {post.pollOptions.map((opt, idx) => {
            const isSelected = idx === post.selectedOption;
            return (
              <View key={idx} style={styles.pollOption}>
                <View style={styles.pollLabelRow}>
                  <Text
                    variant="bodySmall"
                    color={isSelected ? colors.primary : colors.text}
                    style={isSelected ? styles.pollLabelSelected : undefined}
                  >
                    {opt.text}
                  </Text>
                  <Text variant="bodySmall" color={colors.textSecondary}>
                    {opt.percent}%
                  </Text>
                </View>
                <View style={[styles.pollBar, { backgroundColor: colors.surfaceMuted }]}>
                  <View
                    style={[
                      styles.pollBarFill,
                      {
                        width: `${opt.percent}%` as any,
                        backgroundColor: isSelected ? colors.primary : colors.textTertiary,
                      },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Caption */}
      {post.caption ? (
        <View style={styles.captionWrap}>
          <Text variant="body" color={colors.text}>
            {post.caption}
          </Text>
        </View>
      ) : null}

      {/* Reactions row */}
      <View style={styles.reactionsRow}>
        {REACTION_EMOJIS.map((emoji) => {
          const count = localReactions[emoji] ?? 0;
          if (count === 0 && emoji !== 'fire') return null;
          const isActive = myReaction === emoji;
          return (
            <TouchableOpacity
              key={emoji}
              onPress={() => handleReaction(emoji)}
              activeOpacity={0.75}
              style={[
                styles.reactionBtn,
                {
                  backgroundColor: isActive ? `${colors.primary}20` : colors.surfaceMuted,
                  borderColor: isActive ? colors.primary : 'transparent',
                },
              ]}
            >
              <Text style={styles.reactionEmoji}>{REACTION_CHARS[emoji]}</Text>
              <Text variant="micro" color={isActive ? colors.primary : colors.textSecondary}>
                {count}
              </Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          onPress={() => setExpanded((e) => !e)}
          activeOpacity={0.75}
          style={[styles.reactionBtn, { backgroundColor: colors.surfaceMuted, borderColor: 'transparent' }]}
        >
          <Text variant="micro" color={colors.textSecondary}>
            {expanded ? 'Hide' : `${localComments.length} comment${localComments.length !== 1 ? 's' : ''}`}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Comments */}
      {expanded ? (
        <View style={styles.commentsSection}>
          {localComments.map((c, idx) => (
            <View key={idx} style={styles.commentRow}>
              <Text variant="label" color={colors.text}>
                @{c.username}{' '}
              </Text>
              <Text variant="bodySmall" color={colors.textSecondary}>
                {c.text}
              </Text>
            </View>
          ))}
          <View style={[styles.commentInput, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <TextInput
              value={newComment}
              onChangeText={setNewComment}
              placeholder="Add a comment..."
              placeholderTextColor={colors.textTertiary}
              style={[styles.commentInputText, { color: colors.text }]}
              returnKeyType="send"
              onSubmitEditing={handleAddComment}
            />
            <TouchableOpacity onPress={handleAddComment} activeOpacity={0.7}>
              <Text variant="label" color={colors.primary}>
                Send
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 18,
  },
  headerText: {
    flex: 1,
    gap: 1,
  },
  typeBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  typeBadgeText: {
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  photo: {
    width: '100%',
    aspectRatio: 1,
  },
  pollContainer: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  pollOption: {
    gap: 4,
  },
  pollLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pollLabelSelected: {
    fontWeight: '700',
  },
  pollBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  pollBarFill: {
    height: 6,
    borderRadius: 3,
  },
  captionWrap: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    lineHeight: 22,
  },
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  reactionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  reactionEmoji: {
    fontSize: 14,
  },
  commentsSection: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  commentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  commentInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  commentInputText: {
    flex: 1,
    fontSize: 14,
    minHeight: 32,
  },
});
