import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
  View,
  type ViewToken,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useCommentWindow } from '../../hooks/useCommentWindow';
import { useInlineWindowPaging } from '../../hooks/useInlineWindowPaging';
import {
  commentViewport,
  inlineCommentRows,
  readableCommentRows,
  INLINE_ROOT_BUDGET,
  type InlineCommentRow,
} from '../../lib/inlineCommentPaging';
import { canKeepQueryDataOnError } from '../../lib/queryDisplayState';
import type { CommentPageRow } from '../../lib/commentWindow';
import type { FeedAudience } from '../../lib/feedAudience';
import { Spacing } from '../../constants/theme';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { InlineReplyWindow, type ReplyController } from './InlineReplyWindow';

const EMPTY_IDS: ReadonlySet<string> = new Set();
const viewabilityConfig = { itemVisiblePercentThreshold: 1 };
export function InlineCommentList({
  postId,
  audience,
  enabled,
  replyTargetId,
  renderComment,
  onAvailability,
}: {
  postId: string;
  audience: FeedAudience;
  enabled: boolean;
  replyTargetId?: string;
  renderComment: (comment: CommentPageRow, reply: boolean) => ReactElement;
  onAvailability: (available: boolean) => void;
}) {
  const { colors } = useTheme();
  const root = useCommentWindow({ postId, audience, parentId: null }, enabled, INLINE_ROOT_BUDGET);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [replies, setReplies] = useState<ReadonlyMap<string, ReplyController>>(new Map());
  const [viewport, setViewport] = useState(() => commentViewport([]));
  const [atHead, setAtHead] = useState(true);
  const listRef = useRef<FlatList<InlineCommentRow>>(null);
  const generation = useRef(root.data?.generation);
  useLayoutEffect(() => {
    if (generation.current !== root.data?.generation && atHead)
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    generation.current = root.data?.generation;
  }, [root.data?.generation, atHead]);
  const roots = useMemo(
    () => readableCommentRows({ data: root.data, isError: root.isError, error: root.error }),
    [root.data, root.isError, root.error],
  );
  const retained = useMemo(() => new Set(roots.map((row) => row.id)), [roots]);
  const open = useMemo(() => [...expanded].filter((id) => retained.has(id)), [expanded, retained]);
  const loadRoot = useInlineWindowPaging(root, enabled, viewport.roots, atHead);
  const denied = root.isError && !canKeepQueryDataOnError(root.data, root.error);
  useEffect(() => {
    onAvailability(!!root.data && !denied);
  }, [root.data, denied, onAvailability]);
  useEffect(() => {
    setExpanded((old) =>
      [...old].some((id) => !retained.has(id))
        ? new Set([...old].filter((id) => retained.has(id)))
        : old,
    );
  }, [retained]);
  useEffect(() => {
    if (replyTargetId && retained.has(replyTargetId))
      setExpanded((old) => (old.has(replyTargetId) ? old : new Set([...old, replyTargetId])));
  }, [replyTargetId, retained]);
  const onChange = useCallback((id: string, state: ReplyController | undefined) => {
    setReplies((old) => {
      const next = new Map(old);
      if (state) next.set(id, state);
      else next.delete(id);
      return next;
    });
  }, []);
  const toggle = useCallback(
    (id: string) =>
      setExpanded((old) => {
        const next = new Set(old);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );
  const rows = useMemo(
    () => inlineCommentRows(roots, expanded, replies),
    [roots, expanded, replies],
  );
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<InlineCommentRow>[] }) => {
      const next = commentViewport(
        viewableItems.filter((item) => item.isViewable).map((item) => item.item),
      );
      setViewport((old) =>
        JSON.stringify([...old.roots, ...[...old.replies].map(([id, ids]) => [id, ...ids])]) ===
        JSON.stringify([...next.roots, ...[...next.replies].map(([id, ids]) => [id, ...ids])])
          ? old
          : next,
      );
    },
    [],
  );
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setAtHead(event.nativeEvent.contentOffset.y <= 2);
  }, []);
  const renderItem = useCallback(
    ({ item }: { item: InlineCommentRow }) => {
      if (item.kind === 'comment') return renderComment(item.comment, item.reply);
      if (item.kind === 'toggle') {
        const count = item.replyCount;
        const label = item.expanded ? 'Hide replies' : count === undefined
          ? 'View replies' : `View ${count} ${count === 1 ? 'reply' : 'replies'}`;
        return (
          <TouchableOpacity
            onPress={() => toggle(item.rootId)}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={{ paddingLeft: Spacing.xl + Spacing.md, paddingVertical: Spacing.xs }}
          >
            <Text variant="micro" color={colors.textTertiary} style={{ fontWeight: '600' }}>
              {'— '}
              {label}
            </Text>
          </TouchableOpacity>
        );
      }
      return (
        <View
          style={{ minHeight: 36, paddingLeft: Spacing.xl + Spacing.md, justifyContent: 'center' }}
        >
          {item.state?.isError ? (
            <Button variant="secondary" size="sm" onPress={() => replies.get(item.rootId)?.retry()}>
              Retry replies
            </Button>
          ) : !item.state?.data || item.state.isPaging ? (
            <ActivityIndicator accessibilityLabel="Loading replies" color={colors.textSecondary} />
          ) : null}
        </View>
      );
    },
    [renderComment, colors, replies, toggle],
  );
  if (!root.data || denied) return (
    <View testID="comment-read-status" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.md, gap: Spacing.sm }}>
      {root.isError ? (
        <>
          <Text variant="bodySmall" color={colors.textSecondary} style={{ textAlign: 'center' }}>
            Couldn't load comments.
          </Text>
          <Button variant="secondary" size="sm" loading={root.isFetching} onPress={() => loadRoot(root.lastIntent, true)}>
            Try again
          </Button>
        </>
      ) : <ActivityIndicator accessibilityLabel="Loading comments" color={colors.textSecondary} />}
    </View>
  );
  return (
    <View style={{ flex: 1 }}>
      {open.map((parentId) => (
        <InlineReplyWindow
          key={parentId}
          postId={postId}
          audience={audience}
          parentId={parentId}
          enabled={enabled && viewport.roots.has(parentId)}
          visible={viewport.replies.get(parentId) ?? EMPTY_IDS}
          onChange={onChange}
        />
      ))}
      {root.isError ? (
        <View style={{ padding: Spacing.md }}>
          <Text variant="bodySmall">
            Could not refresh comments.
          </Text>
          <Button variant="secondary" size="sm" onPress={() => loadRoot(root.lastIntent, true)}>
            Try again
          </Button>
        </View>
      ) : null}
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={12}
        removeClippedSubviews={false}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        onScroll={onScroll}
        scrollEventThrottle={32}
        onEndReached={() => loadRoot('next')}
        onEndReachedThreshold={2}
        ListFooterComponent={
          <View style={{ height: 52, alignItems: 'center', justifyContent: 'center' }}>
            {root.isPaging ? <ActivityIndicator accessibilityLabel="Loading more comments" color={colors.textSecondary} /> : null}
          </View>
        }
        ListEmptyComponent={
          !root.isError ? (
            <Text variant="bodySmall" style={{ textAlign: 'center', padding: Spacing.md }}>
              No comments yet. Say something nice.
            </Text>
          ) : null
        }
      />
    </View>
  );
}
