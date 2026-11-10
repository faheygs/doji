import { memo, useMemo, useCallback, useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  type TextInput,
  ActivityIndicator,
  Platform,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useNavigationOrigin } from '../../contexts/NavigationOriginContext';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { AppTextInput } from '../ui/AppTextInput';
import { Avatar } from '../ui/Avatar';
import { IconHeartSmall, IconMoreVertical } from '../icons/Icons';
import { InlineFeedback } from '../ui/InlineFeedback';
import { MentionAutocomplete } from '../comments/MentionAutocomplete';
import { CommentBody } from '../comments/CommentBody';
import { CommentActionSheet } from '../comments/CommentActionSheet';
import { CommentWindowList } from '../comments/CommentWindowList';
import { COMMENT_PAGING_V2_ENABLED } from '../../lib/commentPagingFeature';
import type { CommentPageRow } from '../../lib/commentWindow';
import { useCommentPageLookahead } from '../../hooks/useCommentPageLookahead';
import { formatCompactCount } from '../../utils/formatCount';
import { formatCompactRelativeTime } from '../../utils/time';
import { prepareProfileHref } from '../../lib/profileNavigation';
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
import { useReportFlow } from '../../contexts/ReportFlowContext';
import type { ReportSubject } from './ReportSheet';
import { canKeepQueryDataOnError } from '../../lib/queryDisplayState';
import { useAppDialog } from '../../contexts/DialogContext';
import { ListRowsSkeleton } from '../ui/LoadingSkeletons';
import {
  buildCommentRows,
  replyRootId,
  type CommentThreadRow as Row,
} from '../../lib/commentThread';
const MAX_LEN = 2000;
type CommentRowProps = {
  comment: CommentWithMeta;
  isReply: boolean;
  me: string | undefined;
  onReply: (c: CommentWithMeta) => void;
  onProfile: (username: string) => void;
  onToggleLike: (commentId: string, liked: boolean) => void;
  onViewLikes: (commentId: string) => void;
  onOpenMenu: (c: CommentWithMeta) => void;
  onOpenReport: (c: CommentWithMeta) => void;
  colors: ReturnType<typeof useTheme>['colors'];
};
const CommentRow = memo(function CommentRow({
  comment,
  isReply,
  me,
  onReply,
  onProfile,
  onToggleLike,
  onViewLikes,
  onOpenMenu,
  onOpenReport,
  colors,
}: CommentRowProps) {
  const u = comment.profile?.username ?? 'unknown';
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
          marginLeft: Spacing.xl,
          paddingLeft: Spacing.md,
          borderLeftWidth: 2,
          borderLeftColor: colors.hairline,
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
    [colors.hairline],
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
            accessibilityLabel={`Reply to ${u}`}
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
});

type Props = {
  postId: string;
  postOwnerId?: string | null;
  commentsDisabled?: boolean;
  /** When false, skips loading comments (e.g. sheet closed). */
  fetchEnabled?: boolean;
  /** Sheet handles safe area; avoid double padding on composer. */
  embedInSheet?: boolean;
  feedAudience?: FeedAudience;
  /** A containing native sheet must dismiss before the account-level report host opens. */
  onReport?: (subject: ReportSubject) => void;
};

export function PostCommentsThread(props: Props) {
  const viewerId = useAuthStore(s => s.session?.user.id);
  return <PostCommentsThreadBody key={JSON.stringify([props.postId, viewerId, props.feedAudience ?? 'everyone'])} {...props} />;
}

function PostCommentsThreadBody({
  postId,
  postOwnerId,
  commentsDisabled = false,
  fetchEnabled = true,
  embedInSheet = false,
  feedAudience = 'everyone',
  onReport,
}: Props) {
  const { colors } = useTheme();
  const { showDialog } = useAppDialog();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const openReport = useReportFlow();
  const navigationOrigin = useNavigationOrigin();
  const me = useAuthStore((s) => s.session?.user?.id);
  const {
    data: commentPages,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching,
    isFetchNextPageError,
    isRefetching,
    refetch,
  } = useComments(postId, { fetchEnabled: fetchEnabled && !COMMENT_PAGING_V2_ENABLED, feedAudience });
  const pagination = useCommentPageLookahead({
    scope: JSON.stringify([postId, me, feedAudience]),
    enabled: fetchEnabled && !!me && !COMMENT_PAGING_V2_ENABLED,
    pages: commentPages?.pages,
    hasNextPage: !!hasNextPage,
    isFetching: isFetching || isFetchingNextPage,
    isError,
    fetchNextPage,
  });
  const comments = useMemo(() => commentPages?.pages.flat() ?? [], [commentPages?.pages]);
  const blockingReadError = isError && !canKeepQueryDataOnError(commentPages, error);
  const addComment = useAddComment();
  const editComment = useEditComment();
  const deleteComment = useDeleteComment();
  const { mutateAsync: toggleLike } = useToggleCommentLike();
  const [draft, setDraft] = useState('');
  const [replyingTo, setReplyingTo] = useState<CommentWithMeta | null>(null);
  const [threadParent, setThreadParent] = useState<CommentPageRow | null>(null);
  const [editingComment, setEditingComment] = useState<CommentWithMeta | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const [menuComment, setMenuComment] = useState<CommentWithMeta | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [likesCommentId, setLikesCommentId] = useState<string | null>(null);
  const [composerError, setComposerError] = useState('');
  const [composerNotice, setComposerNotice] = useState('');
  const [windowReadable, setWindowReadable] = useState(false);
  const pendingLikeIds = useRef(new Set<string>());

  const isPostOwner = Boolean(me && postOwnerId && me === postOwnerId);
  const composerLocked = (commentsDisabled && !isPostOwner) || (COMMENT_PAGING_V2_ENABLED && !windowReadable);

  useEffect(() => {
    if (!fetchEnabled && embedInSheet) {
      Keyboard.dismiss();
    }
  }, [fetchEnabled, embedInSheet]);

  const rows = useMemo(
    () => buildCommentRows(comments, expandedComments),
    [comments, expandedComments],
  );

  const onProfile = useCallback(
    (username: string) => {
      Haptics.selectionAsync();
      const href = prepareProfileHref(username, navigationOrigin);
      if (href) router.push(href);
    },
    [router, navigationOrigin],
  );

  const onReply = useCallback((c: CommentWithMeta) => {
    if (COMMENT_PAGING_V2_ENABLED && !c.parent_id && threadParent?.id !== c.id) {
      setThreadParent({ ...c, has_replies: true });
      setWindowReadable(false);
    }
    setComposerError('');
    setEditingComment(null);
    setReplyingTo(c);
    const username = c.profile?.username?.trim();
    setDraft(username ? `@${username} ` : '');
    setMentionQuery(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [threadParent?.id]);

  const onOpenMenu = useCallback((c: CommentWithMeta) => {
    setMenuComment(c);
  }, []);

  const onOpenReport = useCallback((c: CommentWithMeta) => {
    if (c.user_id) (onReport ?? openReport)({ reportedUserId: c.user_id, commentId: c.id });
  }, [onReport, openReport]);

  const onEdit = useCallback((c: CommentWithMeta) => {
    setComposerError('');
    setReplyingTo(null);
    setEditingComment(c);
    setDraft(c.body);
    setMentionQuery(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const onDelete = useCallback(
    (c: CommentWithMeta) => {
      deleteComment.mutate({ postId, commentId: c.id, feedAudience });
    },
    [deleteComment, feedAudience, postId],
  );

  const onToggleLike = useCallback(
    (commentId: string, liked: boolean) => {
      if (!me || pendingLikeIds.current.has(commentId)) return;
      pendingLikeIds.current.add(commentId);
      // Per-call promises settle independently; mutate callbacks on a shared
      // observer only run for its latest call when different hearts overlap.
      void toggleLike({ postId, commentId, liked })
        .catch(() => undefined)
        .finally(() => pendingLikeIds.current.delete(commentId));
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
    setComposerNotice('');
    setDraft(text);
    setComposerError('');
    const mentionMatch = text.match(/@([a-zA-Z0-9_]*)$/);
    setMentionQuery(mentionMatch ? mentionMatch[1] : null);
  }, []);

  const onSelectMention = useCallback((username: string) => {
    setDraft((prev) => prev.replace(/@[a-zA-Z0-9_]*$/, `@${username} `));
    setMentionQuery(null);
    setComposerError('');
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
        {
          onSuccess: cancelComposerState,
          onError: (err: Error) => {
            setComposerError(err.message || 'Could not save your comment. Try again.');
          },
        },
      );
      return;
    }
    const body = rawBody;
    const replyTarget = replyingTo ?? threadParent;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addComment.mutate(
      {
        postId,
        body,
        parentId: replyTarget ? replyRootId(replyTarget) : null,
        replyToCommentId: replyTarget?.id ?? null,
        feedAudience,
      },
      {
        onSuccess: () => { if (COMMENT_PAGING_V2_ENABLED) setComposerNotice('Comment posted. Select Show latest to view it.'); },
        onError: (err: Error) => {
          setDraft(rawBody);
          setReplyingTo(replyTarget);
          if (__DEV__) console.warn('[useAddComment] failed:', err);
          setComposerError(err.message || 'Could not post your comment. Try again.');
        },
      },
    );
    cancelComposerState();
  }, [
    draft,
    addComment,
    editComment,
    feedAudience,
    postId,
    replyingTo,
    threadParent,
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
            style={{ paddingLeft: Spacing.xl + Spacing.md, paddingVertical: Spacing.xs }}
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
          comment={item.comment}
          isReply={item.kind === 'reply'}
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

  const renderWindowComment = useCallback((comment: CommentPageRow, reply: boolean) => (
    <CommentRow comment={comment} isReply={reply} me={me} colors={colors}
      onReply={onReply} onProfile={onProfile} onToggleLike={onToggleLike}
      onViewLikes={onViewLikes} onOpenMenu={onOpenMenu} onOpenReport={onOpenReport} />
  ), [colors, me, onOpenMenu, onOpenReport, onProfile, onReply, onToggleLike, onViewLikes]);
  const changeThread = useCallback((parent: CommentPageRow | null) => {
    cancelComposerState(); setComposerError(''); setComposerNotice(''); setThreadParent(parent); setWindowReadable(false);
  }, [cancelComposerState]);

  return (
    <View style={styles.root}>
      {COMMENT_PAGING_V2_ENABLED ? (
        <CommentWindowList key={JSON.stringify([postId, me, feedAudience])} postId={postId} audience={feedAudience}
          parent={threadParent}
          enabled={fetchEnabled} renderComment={renderWindowComment} onThreadChange={changeThread} onAvailability={setWindowReadable} />
      ) : isLoading ? (
        <ListRowsSkeleton rows={4} label="Loading comments" />
      ) : blockingReadError ? (
        <View style={[styles.flex1, styles.centered]}>
          <Text variant="body" color={colors.textSecondary} style={{ textAlign: 'center' }}>
            {"Couldn't load comments."}
          </Text>
          <Button
            variant="secondary"
            size="sm"
            loading={isRefetching}
            onPress={() => void refetch()}
            style={{ marginTop: Spacing.md }}
          >
            Try again
          </Button>
        </View>
      ) : (
        <View style={styles.flex1}>
          {isError ? (
            <View style={{ padding: Spacing.md, gap: Spacing.sm }}>
              <InlineFeedback tone="info" message="Couldn’t refresh comments. Showing previously loaded comments." />
              <Button variant="secondary" size="sm" loading={isFetching} onPress={() => void (isFetchNextPageError ? fetchNextPage({ cancelRefetch: false }) : refetch({ cancelRefetch: false }))}>
                Try again
              </Button>
            </View>
          ) : null}
          <FlatList
            style={styles.list}
            data={rows}
            keyExtractor={(item) =>
              item.kind === 'toggle' ? `toggle-${item.parentId}` : item.comment.id
            }
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            initialNumToRender={12}
            removeClippedSubviews={false}
            contentContainerStyle={{ flexGrow: 1 }}
            {...pagination}
            onEndReachedThreshold={2}
            ListFooterComponent={
              <View style={{ height: 52, alignItems: 'center', justifyContent: 'center' }}>
                {isFetchingNextPage ? <ActivityIndicator color={colors.textSecondary} /> : null}
              </View>
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
              {COMMENT_PAGING_V2_ENABLED && !windowReadable ? 'Comments are unavailable until this thread loads.' : 'Comments are turned off.'}
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
                  (replyingTo ?? threadParent)
                    ? `Reply to ${(replyingTo ?? threadParent)?.profile?.username ?? 'user'}…`
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
            {composerError ? (
              <InlineFeedback message={composerError} testID="comment-composer-error" />
            ) : null}
            {composerNotice ? <InlineFeedback tone="info" message={composerNotice} /> : null}
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
            title: 'Delete comment?',
            message: 'This cannot be undone.',
            actions: [
              { label: 'Cancel', variant: 'cancel' },
              { label: 'Delete', variant: 'destructive', onPress: () => onDelete(target) },
            ],
          });
        }}
      />

    </View>
  );
}
