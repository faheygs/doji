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
  type KeyboardEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { usePathname, useRouter } from 'expo-router';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';
import { Avatar } from '../ui/Avatar';
import { IconHeartSmall } from '../icons/Icons';
import { formatCompactCount } from '../../utils/formatCount';
import { formatRelativeTime } from '../../utils/time';
import { hrefWithReturnTo } from '../../lib/navigationReturn';
import {
  useComments,
  useAddComment,
  useToggleCommentLike,
  type CommentWithMeta,
} from '../../hooks/useComments';
import { useAuthStore } from '../../stores/useAuthStore';

const MAX_LEN = 2000;

type Row = { kind: 'root' | 'reply'; comment: CommentWithMeta };

function buildRows(comments: CommentWithMeta[]): Row[] {
  const byParent = new Map<string | null, CommentWithMeta[]>();
  for (const c of comments) {
    const k = c.parent_id;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(c);
  }
  const sortByTime = (a: CommentWithMeta, b: CommentWithMeta) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

  const tops = (byParent.get(null) ?? []).slice().sort(sortByTime);
  const rows: Row[] = [];
  for (const t of tops) {
    rows.push({ kind: 'root', comment: t });
    const replies = (byParent.get(t.id) ?? []).slice().sort(sortByTime);
    for (const r of replies) {
      rows.push({ kind: 'reply', comment: r });
    }
  }
  return rows;
}

type CommentRowProps = {
  row: Row;
  onReply: (c: CommentWithMeta) => void;
  onProfile: (username: string) => void;
  onToggleLike: (commentId: string, liked: boolean) => void;
  colors: ReturnType<typeof useTheme>['colors'];
};

function CommentRow({ row, onReply, onProfile, onToggleLike, colors }: CommentRowProps) {
  const { comment } = row;
  const u = comment.profile?.username ?? 'unknown';
  const isReply = row.kind === 'reply';

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.sm,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.hairline,
          marginLeft: isReply ? Spacing.xl + Spacing.sm : 0,
        },
        avatarCol: { marginRight: Spacing.sm },
        body: { flex: 1, minWidth: 0 },
        metaRow: {
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 6,
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
    [colors.hairline, isReply],
  );

  const liked = Boolean(comment.my_like);
  const heartColor = liked ? colors.danger : colors.textSecondary;

  return (
    <View style={styles.wrap}>
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
          <TouchableOpacity onPress={() => onProfile(u)} accessibilityRole="link">
            <Text variant="bodySmall" style={{ fontWeight: '700' }}>
              @{u}
            </Text>
          </TouchableOpacity>
          <Text variant="micro" color={colors.textTertiary}>
            {formatRelativeTime(comment.created_at)}
          </Text>
        </View>
        <Text variant="body" color={colors.text} style={{ lineHeight: 20 }}>
          {comment.body}
        </Text>
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
    </View>
  );
}

type Props = {
  postId: string;
  /** When false, skips loading comments (e.g. sheet closed). */
  fetchEnabled?: boolean;
  /** Sheet handles safe area; avoid double padding on composer. */
  embedInSheet?: boolean;
};

export function PostCommentsThread({ postId, fetchEnabled = true, embedInSheet = false }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const me = useAuthStore((s) => s.session?.user?.id);
  const { data: comments = [], isLoading, isError } = useComments(postId, { fetchEnabled });
  const addComment = useAddComment();
  const toggleLike = useToggleCommentLike();
  const [draft, setDraft] = useState('');
  const [replyingTo, setReplyingTo] = useState<CommentWithMeta | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!embedInSheet || Platform.OS !== 'ios') return;
    const showEvt = 'keyboardWillShow';
    const hideEvt = 'keyboardWillHide';
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
    setReplyingTo(c);
  }, []);

  const onToggleLike = useCallback(
    (commentId: string, liked: boolean) => {
      if (!me) return;
      toggleLike.mutate({ postId, commentId, liked });
    },
    [me, postId, toggleLike],
  );

  const send = useCallback(() => {
    const body = draft.trim();
    if (!body || addComment.isPending) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addComment.mutate(
      {
        postId,
        body,
        parentId: replyingTo?.id ?? null,
      },
      {
        onSuccess: () => {
          setDraft('');
          setReplyingTo(null);
        },
      },
    );
  }, [draft, addComment, postId, replyingTo]);

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
        send: {
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.sm,
          borderRadius: Radius.md,
          backgroundColor: colors.primary,
        },
        sendDisabled: { opacity: 0.45 },
      }),
    [colors],
  );

  const composerBottomPad = embedInSheet ? Spacing.sm : Math.max(insets.bottom, Spacing.sm);

  const renderItem = useCallback(
    ({ item }: { item: Row }) => (
      <CommentRow
        row={item}
        onReply={onReply}
        onProfile={onProfile}
        onToggleLike={onToggleLike}
        colors={colors}
      />
    ),
    [colors, onProfile, onReply, onToggleLike],
  );

  return (
    <View
      style={[
        styles.root,
        embedInSheet && Platform.OS === 'ios' && keyboardHeight > 0
          ? { paddingBottom: keyboardHeight }
          : null,
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
                No comments yet. Say something nice.
              </Text>
            </View>
          }
        />
      )}

      <View style={[styles.composerWrap, { paddingBottom: composerBottomPad }]}>
        {replyingTo ? (
          <View style={styles.replyBanner}>
            <Text variant="micro" color={colors.textSecondary} numberOfLines={1} style={{ flex: 1 }}>
              Replying to @{replyingTo.profile?.username ?? 'user'}
            </Text>
            <TouchableOpacity onPress={() => setReplyingTo(null)} accessibilityRole="button">
              <Text variant="micro" color={colors.primary} style={{ fontWeight: '600' }}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <View style={styles.inputRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Add a comment…"
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
            multiline
            maxLength={MAX_LEN}
            editable={!addComment.isPending && Boolean(me)}
          />
          <TouchableOpacity
            onPress={send}
            disabled={!draft.trim() || addComment.isPending || !me}
            style={[styles.send, (!draft.trim() || addComment.isPending || !me) && styles.sendDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Send comment"
          >
            {addComment.isPending ? (
              <ActivityIndicator color={colors.onPrimary ?? '#fff'} size="small" />
            ) : (
              <Text variant="label" style={{ color: colors.onPrimary ?? '#fff' }}>
                Post
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
