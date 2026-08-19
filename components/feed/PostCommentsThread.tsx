import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  type TextInput,
  ActivityIndicator,
  Platform,
  Keyboard,
  Modal,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { usePathname, useRouter } from 'expo-router';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';
import { AppTextInput } from '../ui/AppTextInput';
import { Avatar } from '../ui/Avatar';
import { IconHeartSmall, IconMoreVertical } from '../icons/Icons';
import Toast from 'react-native-toast-message';
import { MentionAutocomplete } from '../comments/MentionAutocomplete';
import { formatCompactCount } from '../../utils/formatCount';
import { formatCompactRelativeTime, parseDate } from '../../utils/time';
import { hrefWithReturnTo } from '../../lib/navigationReturn';
import { getEquippedBorder } from '../../lib/cosmetics';
import {
  useComments,
  useAddComment,
  useEditComment,
  useDeleteComment,
  useToggleCommentLike,
  type CommentWithMeta,
} from '../../hooks/useComments';
import type { FeedAudience } from '../../lib/feedAudience';
import { useAuthStore } from '../../stores/useAuthStore';
import { CommentLikesSheet } from './CommentLikesSheet';
import { ReportSheet } from './ReportSheet';
import { useAppDialog } from '../../contexts/DialogContext';
import { ListRowsSkeleton } from '../ui/LoadingSkeletons';
const MAX_LEN = 2000;
const MENTION_BODY_REGEX = /(@[a-zA-Z0-9_]+)/g;
type Row =
  | { kind: 'root'; comment: CommentWithMeta; replyCount: number }
  | { kind: 'reply'; comment: CommentWithMeta; parentUsername?: string }
  | { kind: 'toggle'; parentId: string; replyCount: number; expanded: boolean };
export function buildRows(comments: CommentWithMeta[], expandedComments: Set<string>): Row[] {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const byParent = new Map<string | null, CommentWithMeta[]>();
  for (const c of comments) {
    const k = c.parent_id;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(c);
  }
  const sortByTime = (a: CommentWithMeta, b: CommentWithMeta) =>
    parseDate(a.created_at).getTime() - parseDate(b.created_at).getTime();
  const tops = (byParent.get(null) ?? []).slice().sort(sortByTime);
  const rows: Row[] = [];
  for (const t of tops) {
    const replies = (byParent.get(t.id) ?? []).slice().sort(sortByTime);
    const replyCount = replies.length;
    rows.push({ kind: 'root', comment: t, replyCount });
    if (replyCount > 0) {
      const expanded = expandedComments.has(t.id);
      rows.push({ kind: 'toggle', parentId: t.id, replyCount, expanded });
      if (expanded) {
        for (const r of replies) {
          const parent = r.parent_id ? byId.get(r.parent_id) : undefined;
          rows.push({ kind: 'reply', comment: r, parentUsername: parent?.profile?.username });
        }
      }
    }
  }
  return rows;
}
function stripReplyMention(body: string, parentUsername?: string | null): string {
  if (!parentUsername) return body;
  const prefix = `@${parentUsername}`;
  if (body.toLowerCase().startsWith(prefix.toLowerCase())) {
    return body.slice(prefix.length).replace(/^\s+/, '');
  }
  return body;
}
function CommentActionSheet({
  visible,
  onClose,
  onEdit,
  onDelete,
  onReport,
}: {
  visible: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onReport?: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const sheetStyles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          justifyContent: 'flex-end',
          backgroundColor: 'rgba(0,0,0,0.25)',
        },
        sheet: {
          backgroundColor: colors.surfaceElevated,
          borderTopLeftRadius: Radius.xl,
          borderTopRightRadius: Radius.xl,
          paddingBottom: Math.max(insets.bottom, Spacing.md),
          paddingTop: Spacing.sm,
        },
        row: {
          paddingVertical: Spacing.md,
          paddingHorizontal: Spacing.lg,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.hairline,
        },
        cancel: {
          marginTop: Spacing.sm,
          paddingVertical: Spacing.md,
          alignItems: 'center',
        },
      }),
    [colors, insets.bottom],
  );
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={sheetStyles.backdrop} onPress={onClose}>
        <Pressable style={sheetStyles.sheet} onPress={(e) => e.stopPropagation()}>
          {onEdit ? (
            <TouchableOpacity
              style={sheetStyles.row}
              onPress={() => {
                onClose();
                onEdit();
              }}
              accessibilityRole="button"
              accessibilityLabel="Edit comment"
            >
              <Text variant="body" style={{ fontWeight: '600' }}>
                Edit comment
              </Text>
            </TouchableOpacity>
          ) : null}
          {onDelete ? (
            <TouchableOpacity
              style={sheetStyles.row}
              onPress={() => {
                onClose();
                onDelete();
              }}
              accessibilityRole="button"
              accessibilityLabel="Delete comment"
            >
              <Text variant="body" color={colors.error} style={{ fontWeight: '600' }}>
                Delete comment
              </Text>
            </TouchableOpacity>
          ) : null}
          {onReport ? (
            <TouchableOpacity
              style={sheetStyles.row}
              onPress={() => {
                onClose();
                onReport();
              }}
              accessibilityRole="button"
              accessibilityLabel="Report comment"
            >
              <Text variant="body" color={colors.error} style={{ fontWeight: '600' }}>
                Report comment
              </Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={sheetStyles.cancel} onPress={onClose} accessibilityRole="button">
            <Text variant="body" color={colors.textSecondary}>
              Cancel
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
function CommentBody({
  body,
  colors,
  onMentionPress,
}: {
  body: string;
  colors: ReturnType<typeof useTheme>['colors'];
  onMentionPress: (username: string) => void;
}) {
  const parts = body.split(MENTION_BODY_REGEX);
  return (
    <Text variant="body" color={colors.text} style={{ lineHeight: 20 }}>
      {parts.map((part, i) => {
        if (part.startsWith('@')) {
          const username = part.slice(1);
          return (
            <Text
              key={`${i}-${part}`}
              variant="body"
              color={colors.primary}
              style={{ fontWeight: '600' }}
              onPress={() => onMentionPress(username)}
            >
              {part}
            </Text>
          );
        }
        return <Text key={`${i}-${part}`}>{part}</Text>;
      })}
    </Text>
  );
}
type CommentRowProps = {
  row: Row & { kind: 'root' | 'reply' };
  me: string | undefined;
  onReply: (c: CommentWithMeta) => void;
  onProfile: (username: string) => void;
  onToggleLike: (commentId: string, liked: boolean) => void;
  onViewLikes: (commentId: string) => void;
  onOpenMenu: (c: CommentWithMeta) => void;
  onOpenReport: (c: CommentWithMeta) => void;
  colors: ReturnType<typeof useTheme>['colors'];
};
function CommentRow({
  row,
  me,
  onReply,
  onProfile,
  onToggleLike,
  onViewLikes,
  onOpenMenu,
  onOpenReport,
  colors,
}: CommentRowProps) {
  const { comment } = row;
  const u = comment.profile?.username ?? 'unknown';
  const isReply = row.kind === 'reply';
  const isOwn = Boolean(me && comment.user_id === me);
  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.sm,
        },
        replyWrap: {
          paddingLeft: Spacing.xl,
        },
        avatarCol: { marginRight: Spacing.sm, marginTop: 1 },
        body: { flex: 1, minWidth: 0 },
        metaRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.xs,
          marginBottom: 2,
          flexWrap: 'nowrap',
        },
        usernameWrap: { flexShrink: 1, minWidth: 0 },
        menuBtn: { padding: 4, marginLeft: Spacing.xs },
        actions: {
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: Spacing.xs,
          gap: Spacing.md,
        },
        likeCol: {
          alignItems: 'center',
          paddingLeft: Spacing.sm,
          paddingTop: 2,
          minWidth: 36,
          gap: 2,
        },
        likeCount: { fontVariant: ['tabular-nums'] },
      }),
    [],
  );
  const liked = Boolean(comment.my_like);
  const heartColor = liked ? colors.danger : colors.textTertiary;
  const showOwnMenu = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onOpenMenu(comment);
  }, [comment, onOpenMenu]);
  return (
    <TouchableOpacity
      style={[styles.wrap, isReply && styles.replyWrap]}
      activeOpacity={1}
      onLongPress={isOwn ? showOwnMenu : undefined}
      delayLongPress={400}
      accessibilityHint={isOwn ? 'Long press for edit or delete' : undefined}
    >
      <TouchableOpacity
        onPress={() => onProfile(u)}
        style={styles.avatarCol}
        accessibilityRole="button"
        accessibilityLabel={`${u} profile`}
      >
        {(() => {
          const border = getEquippedBorder(comment.profile);
          return (
            <Avatar
              uri={comment.profile?.avatar_url}
              username={u}
              size={isReply ? 28 : 36}
              borderColor={border?.color}
              borderWidth={border?.width}
            />
          );
        })()}
      </TouchableOpacity>
      <View style={styles.body}>
        <View style={styles.metaRow}>
          <TouchableOpacity
            onPress={() => onProfile(u)}
            style={styles.usernameWrap}
            accessibilityRole="link"
          >
            <Text
              variant="bodySmall"
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{ fontWeight: '700', color: colors.text }}
            >
              {u}
            </Text>
          </TouchableOpacity>
          <Text variant="micro" color={colors.textTertiary} numberOfLines={1}>
            {formatCompactRelativeTime(comment.created_at)}
            {comment.body_edited ? ' · edited' : ''}
          </Text>
          {isOwn ? (
            <TouchableOpacity
              onPress={showOwnMenu}
              accessibilityRole="button"
              accessibilityLabel="Edit or delete comment"
              style={styles.menuBtn}
            >
              <IconMoreVertical size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onOpenReport(comment);
              }}
              accessibilityRole="button"
              accessibilityLabel="Report comment"
              style={styles.menuBtn}
            >
              <IconMoreVertical size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
        <CommentBody body={comment.body} colors={colors} onMentionPress={onProfile} />
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              onReply(comment);
            }}
            accessibilityRole="button"
            accessibilityLabel="Reply"
          >
            <Text variant="micro" color={colors.textTertiary} style={{ fontWeight: '600' }}>
              Reply
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.likeCol}>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onToggleLike(comment.id, liked);
          }}
          accessibilityRole="button"
          accessibilityLabel={liked ? 'Unlike comment' : 'Like comment'}
        >
          <IconHeartSmall size={18} color={heartColor} filled={liked} />
        </TouchableOpacity>
        {comment.like_count > 0 ? (
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              onViewLikes(comment.id);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${comment.like_count} likes, tap to see who liked`}
          >
            <Text variant="micro" color={colors.textTertiary} style={styles.likeCount}>
              {formatCompactCount(comment.like_count)}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

type Props = {
  postId: string;
  postOwnerId?: string | null;
  commentsDisabled?: boolean;
  /** When false, skips loading comments (e.g. sheet closed). */
  fetchEnabled?: boolean;
  /** Sheet handles safe area; avoid double padding on composer. */
  embedInSheet?: boolean;
  /** Overlay inset measured by the sheet that owns keyboard avoidance. */
  keyboardInset?: number;
  feedAudience?: FeedAudience;
};

export function PostCommentsThread({
  postId,
  postOwnerId,
  commentsDisabled = false,
  fetchEnabled = true,
  embedInSheet = false,
  keyboardInset = 0,
  feedAudience = 'everyone',
}: Props) {
  const { colors } = useTheme();
  const { showDialog } = useAppDialog();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const me = useAuthStore((s) => s.session?.user?.id);
  const {
    data: commentPages,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useComments(postId, { fetchEnabled, feedAudience });
  const comments = useMemo(
    () => commentPages?.pages.flat() ?? [],
    [commentPages?.pages],
  );
  const addComment = useAddComment();
  const editComment = useEditComment();
  const deleteComment = useDeleteComment();
  const toggleLike = useToggleCommentLike();
  const [draft, setDraft] = useState('');
  const [replyingTo, setReplyingTo] = useState<CommentWithMeta | null>(null);
  const [editingComment, setEditingComment] = useState<CommentWithMeta | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const [menuComment, setMenuComment] = useState<CommentWithMeta | null>(null);
  const [reportComment, setReportComment] = useState<CommentWithMeta | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [likesCommentId, setLikesCommentId] = useState<string | null>(null);
  const pendingLikeIds = useRef(new Set<string>());

  const isPostOwner = Boolean(me && postOwnerId && me === postOwnerId);
  const composerLocked = commentsDisabled && !isPostOwner;

  useEffect(() => {
    if (!fetchEnabled && embedInSheet) {
      Keyboard.dismiss();
    }
  }, [fetchEnabled, embedInSheet]);

  const rows = useMemo(() => buildRows(comments, expandedComments), [comments, expandedComments]);

  const onProfile = useCallback(
    (username: string) => {
      Haptics.selectionAsync();
      router.push(hrefWithReturnTo(`/(app)/member/${username}`, pathname));
    },
    [router, pathname],
  );

  const onReply = useCallback((c: CommentWithMeta) => {
    setEditingComment(null);
    setReplyingTo(c);
    setDraft('');
    setMentionQuery(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const onOpenMenu = useCallback((c: CommentWithMeta) => {
    setMenuComment(c);
  }, []);

  const onOpenReport = useCallback((c: CommentWithMeta) => {
    setReportComment(c);
  }, []);

  const onEdit = useCallback((c: CommentWithMeta) => {
    setReplyingTo(null);
    setEditingComment(c);
    setDraft(c.body);
    setMentionQuery(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const onDelete = useCallback(
    (c: CommentWithMeta) => {
      deleteComment.mutate({ postId, commentId: c.id });
    },
    [deleteComment, postId],
  );

  const onToggleLike = useCallback(
    (commentId: string, liked: boolean) => {
      if (!me || pendingLikeIds.current.has(commentId)) return; pendingLikeIds.current.add(commentId);
      toggleLike.mutate({ postId, commentId, liked }, { onSettled: () => pendingLikeIds.current.delete(commentId) });
    },
    [me, postId, toggleLike],
  );

  const onViewLikes = useCallback((commentId: string) => {
    setLikesCommentId(commentId);
  }, []);

  const onToggleReplies = useCallback((parentId: string) => {
    Haptics.selectionAsync();
    setExpandedComments((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  }, []);

  const onChangeDraft = useCallback((text: string) => {
    setDraft(text);
    const mentionMatch = text.match(/@([a-zA-Z0-9_]*)$/);
    setMentionQuery(mentionMatch ? mentionMatch[1] : null);
  }, []);

  const onSelectMention = useCallback((username: string) => {
    setDraft((prev) => prev.replace(/@[a-zA-Z0-9_]*$/, `@${username} `));
    setMentionQuery(null);
    inputRef.current?.focus();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const cancelComposerState = useCallback(() => {
    setReplyingTo(null);
    setEditingComment(null);
    setDraft('');
    setMentionQuery(null);
  }, []);

  const send = useCallback(() => {
    const rawBody = draft.trim();
    if (!rawBody || addComment.isPending || editComment.isPending || composerLocked) return;
    if (editingComment) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      editComment.mutate(
        { postId, commentId: editingComment.id, body: rawBody },
        { onSuccess: cancelComposerState },
      );
      return;
    }
    const body = replyingTo ? stripReplyMention(rawBody, replyingTo.profile?.username) : rawBody;
    if (!body) return;
    const replyTarget = replyingTo;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addComment.mutate(
      {
        postId,
        body,
        parentId: replyingTo?.id ?? null,
      },
      {
        onError: (err: Error) => {
          setDraft(rawBody); setReplyingTo(replyTarget);
          if (__DEV__) console.warn('[useAddComment] failed:', err);
          Toast.show({ type: 'error', text1: err.message || 'Failed to post comment' });
        },
      },
    );
    cancelComposerState();
  }, [
    draft,
    addComment,
    editComment,
    postId,
    replyingTo,
    editingComment,
    composerLocked,
    cancelComposerState,
  ]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        flex1: { flex: 1 },
        root: { flex: 1, minHeight: 0 },
        list: { flex: 1 },
        centered: { padding: Spacing.xl, alignItems: 'center' },
        composerWrap: {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.hairline,
          paddingHorizontal: Spacing.md,
          paddingTop: Spacing.sm,
          backgroundColor: colors.surface,
        },
        replyBanner: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: Spacing.xs,
          backgroundColor: `${colors.primary}15`,
          marginHorizontal: -Spacing.md,
          paddingHorizontal: Spacing.md,
          paddingTop: Spacing.xs,
          marginBottom: Spacing.xs,
        },
        inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
        input: {
          flex: 1,
          minHeight: 44,
          maxHeight: 120,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.hairline,
          borderRadius: Radius.md,
          paddingHorizontal: Spacing.sm,
          paddingVertical: Platform.OS === 'ios' ? Spacing.sm : Spacing.xs,
          color: colors.text,
          backgroundColor: colors.background,
          fontSize: 16,
        },
        inputActive: {
          borderColor: colors.primary,
          borderWidth: 1.5,
        },
        send: {
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.sm,
          borderRadius: Radius.md,
          backgroundColor: colors.primary,
        },
        sendDisabled: { opacity: 0.45 },
        lockedNote: {
          paddingVertical: Spacing.sm,
          alignItems: 'center',
        },
        composerHint: {
          marginTop: Spacing.xs,
          textAlign: 'right',
        },
      }),
    [colors],
  );

  const composerBottomPad = embedInSheet ? Spacing.sm : Math.max(insets.bottom, Spacing.sm);
  const composerBusy = addComment.isPending || editComment.isPending;
  const inputBorderStyle =
    replyingTo || editingComment || mentionQuery !== null ? styles.inputActive : null;

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === 'toggle') {
        const label = item.expanded
          ? 'Hide replies'
          : `View ${item.replyCount} ${item.replyCount === 1 ? 'reply' : 'replies'}`;
        return (
          <TouchableOpacity
            onPress={() => onToggleReplies(item.parentId)}
            style={{ paddingLeft: Spacing.xl + 28 + Spacing.sm, paddingVertical: Spacing.xs }}
            accessibilityRole="button"
            accessibilityLabel={label}
          >
            <Text variant="micro" color={colors.textTertiary} style={{ fontWeight: '600' }}>
              {'— '}
              {label}
            </Text>
          </TouchableOpacity>
        );
      }
      return (
        <CommentRow
          row={item}
          me={me}
          onReply={onReply}
          onProfile={onProfile}
          onToggleLike={onToggleLike}
          onViewLikes={onViewLikes}
          onOpenMenu={onOpenMenu}
          onOpenReport={onOpenReport}
          colors={colors}
        />
      );
    },
    [
      colors,
      me,
      onOpenMenu,
      onOpenReport,
      onProfile,
      onReply,
      onToggleLike,
      onViewLikes,
      onToggleReplies,
    ],
  );

  return (
    <View
      style={[
        styles.root,
        embedInSheet && keyboardInset > 0 ? { paddingBottom: keyboardInset } : null,
      ]}
    >
      {isLoading ? (
        <ListRowsSkeleton rows={4} label="Loading comments" />
      ) : isError ? (
        <View style={[styles.flex1, styles.centered]}>
          <Text variant="body" color={colors.textSecondary} style={{ textAlign: 'center' }}>
            {"Couldn't load comments."}
          </Text>
        </View>
      ) : (
        <View style={styles.flex1}>
          <FlatList
            style={styles.list}
            data={rows}
            keyExtractor={(item) =>
              item.kind === 'toggle' ? `toggle-${item.parentId}` : item.comment.id
            }
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            windowSize={5}
            initialNumToRender={12}
            maxToRenderPerBatch={8}
            removeClippedSubviews={Platform.OS === 'android'}
            contentContainerStyle={{ flexGrow: 1 }}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
            }}
            onEndReachedThreshold={0.35}
            ListFooterComponent={
              isFetchingNextPage ? (
                <ActivityIndicator color={colors.textSecondary} style={{ margin: Spacing.md }} />
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.centered}>
                <Text variant="body" color={colors.textSecondary}>
                  {commentsDisabled
                    ? 'Comments are turned off on this post.'
                    : 'No comments yet. Say something nice.'}
                </Text>
              </View>
            }
          />
        </View>
      )}

      <View style={[styles.composerWrap, { paddingBottom: composerBottomPad }]}>
        {composerLocked ? (
          <View style={styles.lockedNote}>
            <Text variant="bodySmall" color={colors.textSecondary} style={{ textAlign: 'center' }}>
              Comments are turned off.
            </Text>
          </View>
        ) : (
          <>
            {replyingTo ? (
              <View style={styles.replyBanner}>
                <Text
                  variant="micro"
                  color={colors.primary}
                  numberOfLines={1}
                  style={{ flex: 1, fontWeight: '600' }}
                >
                  Replying to {replyingTo.profile?.username ?? 'user'}
                </Text>
                <TouchableOpacity onPress={cancelComposerState} accessibilityRole="button">
                  <Text variant="micro" color={colors.primary} style={{ fontWeight: '600' }}>
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {editingComment ? (
              <View style={styles.replyBanner}>
                <Text
                  variant="micro"
                  color={colors.primary}
                  numberOfLines={1}
                  style={{ flex: 1, fontWeight: '600' }}
                >
                  Editing comment
                </Text>
                <TouchableOpacity onPress={cancelComposerState} accessibilityRole="button">
                  <Text variant="micro" color={colors.primary} style={{ fontWeight: '600' }}>
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <MentionAutocomplete
              query={mentionQuery ?? ''}
              visible={mentionQuery !== null}
              onSelect={onSelectMention}
            />
            <View style={styles.inputRow}>
              <AppTextInput
                ref={inputRef}
                value={draft}
                onChangeText={onChangeDraft}
                placeholder={
                  replyingTo
                    ? `Reply to ${replyingTo.profile?.username ?? 'user'}…`
                    : 'Add a comment…'
                }
                placeholderTextColor={colors.textTertiary}
                style={[styles.input, inputBorderStyle]}
                multiline
                maxLength={MAX_LEN}
                editable={!composerBusy && Boolean(me)}
              />
              <TouchableOpacity
                onPress={send}
                disabled={!draft.trim() || composerBusy || !me}
                style={[styles.send, (!draft.trim() || composerBusy || !me) && styles.sendDisabled]}
                accessibilityRole="button"
                accessibilityLabel={editingComment ? 'Save comment' : 'Send comment'}
              >
                {composerBusy ? (
                  <ActivityIndicator color={colors.onPrimary} size="small" />
                ) : (
                  <Text variant="label" style={{ color: colors.onPrimary }}>
                    {editingComment ? 'Save' : 'Post'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
            <Text
              variant="micro"
              color={draft.length >= MAX_LEN ? colors.error : colors.textTertiary}
              style={styles.composerHint}
            >
              {draft.trim().length === 0 && draft.length > 0
                ? 'Comment cannot be empty'
                : `${draft.length}/${MAX_LEN}`}
            </Text>
          </>
        )}
      </View>

      <CommentLikesSheet
        visible={likesCommentId != null}
        commentId={likesCommentId ?? ''}
        onClose={() => setLikesCommentId(null)}
      />

      <CommentActionSheet
        visible={menuComment != null}
        onClose={() => setMenuComment(null)}
        onEdit={() => {
          if (menuComment) onEdit(menuComment);
        }}
        onDelete={() => {
          const target = menuComment;
          if (!target) return;
          showDialog({
            title: 'Delete comment?', message: 'This cannot be undone.',
            actions: [
              { label: 'Cancel', variant: 'cancel' },
              { label: 'Delete', variant: 'destructive', onPress: () => onDelete(target) },
            ],
          });
        }}
      />

      {reportComment?.user_id ? (
        <ReportSheet
          visible
          reportedUserId={reportComment.user_id}
          commentId={reportComment.id}
          onClose={() => setReportComment(null)}
        />
      ) : null}
    </View>
  );
}
