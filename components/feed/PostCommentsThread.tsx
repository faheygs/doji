import React, { useMemo, useCallback, useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  Keyboard,
  Modal,
  Pressable,
  Alert,
  type KeyboardEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { usePathname, useRouter } from 'expo-router';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';
import { Avatar } from '../ui/Avatar';
import { IconHeartSmall, IconMoreVertical } from '../icons/Icons';
import { MentionAutocomplete } from '../comments/MentionAutocomplete';
import { formatCompactCount } from '../../utils/formatCount';
import { formatCompactRelativeTime, parseDate } from '../../utils/time';
import { hrefWithReturnTo } from '../../lib/navigationReturn';
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

const MAX_LEN = 2000;
const MENTION_BODY_REGEX = /(@[a-zA-Z0-9_]+)/g;

type Row = { kind: 'root' | 'reply'; comment: CommentWithMeta; parentUsername?: string };

function buildRows(comments: CommentWithMeta[]): Row[] {
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
    rows.push({ kind: 'root', comment: t });
    const replies = (byParent.get(t.id) ?? []).slice().sort(sortByTime);
    for (const r of replies) {
      const parent = r.parent_id ? byId.get(r.parent_id) : undefined;
      rows.push({
        kind: 'reply',
        comment: r,
        parentUsername: parent?.profile?.username,
      });
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
}: {
  visible: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const sheetStyles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          backgroundColor: colors.overlayBackdrop,
          justifyContent: 'flex-end',
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

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={sheetStyles.backdrop} onPress={onClose}>
        <Pressable style={sheetStyles.sheet} onPress={(e) => e.stopPropagation()}>
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
  row: Row;
  me: string | undefined;
  onReply: (c: CommentWithMeta) => void;
  onProfile: (username: string) => void;
  onToggleLike: (commentId: string, liked: boolean) => void;
  onOpenMenu: (c: CommentWithMeta) => void;
  colors: ReturnType<typeof useTheme>['colors'];
};

function CommentRow({
  row,
  me,
  onReply,
  onProfile,
  onToggleLike,
  onOpenMenu,
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
          marginHorizontal: Spacing.md,
          marginBottom: Spacing.sm,
          paddingHorizontal: Spacing.sm,
          paddingVertical: Spacing.sm,
          borderRadius: Radius.md,
          backgroundColor: colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.hairline,
        },
        replyWrap: {
          marginLeft: Spacing.xl + Spacing.sm,
          paddingLeft: Spacing.sm + 2,
          borderLeftWidth: 2,
          borderLeftColor: colors.primary,
        },
        avatarCol: { marginRight: Spacing.sm },
        body: { flex: 1, minWidth: 0 },
        metaRow: {
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 4,
        },
        metaMain: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'nowrap',
          gap: 6,
          minWidth: 0,
        },
        usernameWrap: {
          flexShrink: 1,
          minWidth: 0,
        },
        timeText: {
          flexShrink: 0,
        },
        menuBtn: {
          padding: 4,
          marginLeft: Spacing.xs,
        },
        replyToLabel: {
          marginBottom: 4,
        },
        actions: {
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: 6,
        },
        likeCol: {
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingTop: 2,
          paddingLeft: Spacing.sm,
          minWidth: 40,
          gap: 2,
        },
        likeCount: {
          fontVariant: ['tabular-nums'],
        },
        replyLabel: { fontWeight: '600' },
      }),
    [colors.hairline, colors.primary, colors.surface],
  );

  const liked = Boolean(comment.my_like);
  const heartColor = liked ? colors.danger : colors.textSecondary;

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
        <Avatar uri={comment.profile?.avatar_url} username={u} size={isReply ? 32 : 36} />
      </TouchableOpacity>
      <View style={styles.body}>
        <View style={styles.metaRow}>
          <View style={styles.metaMain}>
            <TouchableOpacity
              onPress={() => onProfile(u)}
              style={styles.usernameWrap}
              accessibilityRole="link"
            >
              <Text
                variant="bodySmall"
                numberOfLines={1}
                ellipsizeMode="tail"
                style={{ fontWeight: '700', color: colors.primary }}
              >
                @{u}
              </Text>
            </TouchableOpacity>
            <Text variant="micro" color={colors.textTertiary} style={styles.timeText} numberOfLines={1}>
              {formatCompactRelativeTime(comment.created_at)}
              {comment.body_edited ? ' · edited' : ''}
            </Text>
          </View>
          {isOwn ? (
            <TouchableOpacity
              onPress={showOwnMenu}
              accessibilityRole="button"
              accessibilityLabel="Edit or delete comment"
              style={styles.menuBtn}
            >
              <IconMoreVertical size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
        {isReply && row.parentUsername ? (
          <Text variant="micro" color={colors.textTertiary} style={styles.replyToLabel}>
            Replying to{' '}
            <Text variant="micro" color={colors.primary} style={{ fontWeight: '600' }}>
              {row.parentUsername}
            </Text>
          </Text>
        ) : null}
        <CommentBody body={comment.body} colors={colors} onMentionPress={onProfile} />
        {!isReply ? (
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                onReply(comment);
              }}
              accessibilityRole="button"
              accessibilityLabel="Reply"
            >
              <Text variant="micro" color={colors.textSecondary} style={styles.replyLabel}>
                Reply
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
      <TouchableOpacity
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onToggleLike(comment.id, liked);
        }}
        style={styles.likeCol}
        accessibilityRole="button"
        accessibilityLabel={liked ? 'Unlike comment' : 'Like comment'}
      >
        <IconHeartSmall size={20} color={heartColor} filled={liked} />
        {comment.like_count > 0 ? (
          <Text variant="micro" color={colors.textSecondary} style={styles.likeCount}>
            {formatCompactCount(comment.like_count)}
          </Text>
        ) : null}
      </TouchableOpacity>
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
  feedAudience?: FeedAudience;
};

export function PostCommentsThread({
  postId,
  postOwnerId,
  commentsDisabled = false,
  fetchEnabled = true,
  embedInSheet = false,
  feedAudience = 'everyone',
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const me = useAuthStore((s) => s.session?.user?.id);
  const { data: comments = [], isLoading, isError } = useComments(postId, { fetchEnabled, feedAudience });
  const addComment = useAddComment();
  const editComment = useEditComment();
  const deleteComment = useDeleteComment();
  const toggleLike = useToggleCommentLike();
  const [draft, setDraft] = useState('');
  const [replyingTo, setReplyingTo] = useState<CommentWithMeta | null>(null);
  const [editingComment, setEditingComment] = useState<CommentWithMeta | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [menuComment, setMenuComment] = useState<CommentWithMeta | null>(null);

  const isPostOwner = Boolean(me && postOwnerId && me === postOwnerId);
  const composerLocked = commentsDisabled && !isPostOwner;

  useEffect(() => {
    if (!embedInSheet) return;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: KeyboardEvent) => setKeyboardHeight(e.endCoordinates.height);
    const onHide = () => setKeyboardHeight(0);
    const s = Keyboard.addListener(showEvt, onShow);
    const h = Keyboard.addListener(hideEvt, onHide);
    return () => {
      s.remove();
      h.remove();
    };
  }, [embedInSheet]);

  useEffect(() => {
    if (!fetchEnabled && embedInSheet) {
      Keyboard.dismiss();
      setKeyboardHeight(0);
    }
  }, [fetchEnabled, embedInSheet]);

  const rows = useMemo(() => buildRows(comments), [comments]);

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
  }, []);

  const onOpenMenu = useCallback((c: CommentWithMeta) => {
    setMenuComment(c);
  }, []);

  const onEdit = useCallback((c: CommentWithMeta) => {
    setReplyingTo(null);
    setEditingComment(c);
    setDraft(c.body);
    setMentionQuery(null);
  }, []);

  const onDelete = useCallback(
    (c: CommentWithMeta) => {
      deleteComment.mutate({ postId, commentId: c.id });
    },
    [deleteComment, postId],
  );

  const onToggleLike = useCallback(
    (commentId: string, liked: boolean) => {
      if (!me) return;
      toggleLike.mutate({ postId, commentId, liked });
    },
    [me, postId, toggleLike],
  );

  const onChangeDraft = useCallback((text: string) => {
    setDraft(text);
    const mentionMatch = text.match(/@([a-zA-Z0-9_]*)$/);
    setMentionQuery(mentionMatch ? mentionMatch[1] : null);
  }, []);

  const onSelectMention = useCallback((username: string) => {
    setDraft((prev) => prev.replace(/@[a-zA-Z0-9_]*$/, `@${username} `));
    setMentionQuery(null);
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
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (editingComment) {
      editComment.mutate(
        { postId, commentId: editingComment.id, body: rawBody },
        { onSuccess: cancelComposerState },
      );
      return;
    }

    const body = replyingTo
      ? stripReplyMention(rawBody, replyingTo.profile?.username)
      : rawBody;
    if (!body) return;

    addComment.mutate(
      {
        postId,
        body,
        parentId: replyingTo?.id ?? null,
      },
      { onSuccess: cancelComposerState },
    );
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
    ({ item }: { item: Row }) => (
      <CommentRow
        row={item}
        me={me}
        onReply={onReply}
        onProfile={onProfile}
        onToggleLike={onToggleLike}
        onOpenMenu={onOpenMenu}
        colors={colors}
      />
    ),
    [colors, me, onOpenMenu, onProfile, onReply, onToggleLike],
  );

  return (
    <View
      style={[
        styles.root,
        embedInSheet && keyboardHeight > 0 ? { paddingBottom: keyboardHeight } : null,
      ]}
    >
      {isLoading ? (
        <View style={[styles.flex1, styles.centered]}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : isError ? (
        <View style={[styles.flex1, styles.centered]}>
          <Text variant="body" color={colors.textSecondary} style={{ textAlign: 'center' }}>
            {"Couldn't load comments."}
          </Text>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={rows}
          keyExtractor={(item) => item.comment.id}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ flexGrow: 1 }}
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
                <Text variant="micro" color={colors.primary} numberOfLines={1} style={{ flex: 1, fontWeight: '600' }}>
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
                <Text variant="micro" color={colors.primary} numberOfLines={1} style={{ flex: 1, fontWeight: '600' }}>
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
              <TextInput
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
              color={
                draft.length >= MAX_LEN ? colors.error : colors.textTertiary
              }
              style={styles.composerHint}
            >
              {draft.trim().length === 0 && draft.length > 0
                ? 'Comment cannot be empty'
                : `${draft.length}/${MAX_LEN}`}
            </Text>
          </>
        )}
      </View>

      <CommentActionSheet
        visible={menuComment != null}
        onClose={() => setMenuComment(null)}
        onEdit={() => {
          if (menuComment) onEdit(menuComment);
        }}
        onDelete={() => {
          const target = menuComment;
          if (!target) return;
          Alert.alert('Delete comment?', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => onDelete(target),
            },
          ]);
        }}
      />
    </View>
  );
}
