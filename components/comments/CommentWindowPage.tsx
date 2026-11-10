import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, View, type ViewToken } from 'react-native';
import { useCommentWindow } from '../../hooks/useCommentWindow';
import type { CommentPageRow, CommentScope } from '../../lib/commentWindow';
import { canKeepQueryDataOnError } from '../../lib/queryDisplayState';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { ListRowsSkeleton } from '../ui/LoadingSkeletons';

const anchor = { minIndexForVisible: 0 };
const viewabilityConfig = { itemVisiblePercentThreshold: 1 };
type Props = {
  scope: Omit<CommentScope, 'viewerId'>;
  enabled: boolean;
  renderComment: (comment: CommentPageRow, reply: boolean) => ReactNode;
  onOpenReplies: (comment: CommentPageRow) => void;
  onBack?: () => void;
  onAvailability: (available: boolean) => void;
};

/** One native list per bounded thread. Hidden root lists retain their return offset. */
export function CommentWindowPage({
  scope,
  enabled,
  renderComment,
  onOpenReplies,
  onBack,
  onAvailability,
}: Props) {
  const { colors } = useTheme();
  const query = useCommentWindow(scope, enabled);
  const { data, load, visibleIds, available } = query;
  const rows = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data?.pages]);
  const generation = useRef({ value: data?.generation, key: 0 });
  if (generation.current.value !== data?.generation) {
    generation.current = { value: data?.generation, key: generation.current.key + 1 };
    visibleIds.current = new Set();
  }
  const attempted = useRef<string | null>(null);
  const pageById = useMemo(
    () =>
      new Map(
        data?.pages.flatMap((page, index) => page.items.map((row) => [row.id, index] as const)) ??
          [],
      ),
    [data?.pages],
  );
  const tryPage = useCallback(
    (direction: 'next' | 'previous') => {
      if (!enabled || !available || query.isFetching || query.isError || !data) return;
      const cursor = direction === 'next' ? data.pages.at(-1)?.next : data.pages[0]?.previous;
      if (!cursor) return;
      if (data.pages.length >= 5) {
        const edge = direction === 'next' ? data.pages[0] : data.pages.at(-1)!;
        if (!visibleIds.current.size || edge.items.some((row) => visibleIds.current.has(row.id)))
          return;
      }
      const token = JSON.stringify([generation.current.key, direction, cursor, data.revision]);
      if (attempted.current === token) return;
      attempted.current = token;
      void load(direction);
    },
    [available, data, enabled, load, query.isError, query.isFetching, visibleIds],
  );
  // Prepare only the next page before initial scrolling; never drain a thread.
  useEffect(() => {
    if (data?.pages.length === 1) tryPage('next');
  }, [data?.pages.length, tryPage]);
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<CommentPageRow>[] }) => {
      if (!enabled) return;
      const visible = viewableItems
        .filter((token) => token.isViewable)
        .map((token) => token.item.id);
      if (
        visible.length !== visibleIds.current.size ||
        visible.some((id) => !visibleIds.current.has(id))
      )
        attempted.current = null;
      visibleIds.current = new Set(visible);
      const pages = visible
        .map((id) => pageById.get(id))
        .filter((index): index is number => index !== undefined);
      if (!pages.length || !data) return;
      if (Math.max(...pages) >= data.pages.length - 1) tryPage('next');
      else if (Math.min(...pages) === 0) tryPage('previous');
    },
    [data, enabled, pageById, tryPage, visibleIds],
  );
  const blocked = query.isError && !canKeepQueryDataOnError(data, query.error);
  useEffect(() => {
    if (enabled)
      onAvailability(
        !query.isError && !!data?.pages.length && (!scope.parentId || !!data.parentRow),
      );
  }, [data, enabled, onAvailability, query.isError, scope.parentId]);
  const renderItem = useCallback(
    ({ item }: { item: CommentPageRow }) => (
      <View>
        {renderComment(item, !!scope.parentId)}
        {!scope.parentId ? (
          <View style={{ minHeight: 48, paddingHorizontal: 52 }}>
            {item.has_replies ? (
              <Button size="sm" variant="ghost" onPress={() => onOpenReplies(item)}>
                View replies
              </Button>
            ) : null}
          </View>
        ) : null}
      </View>
    ),
    [onOpenReplies, renderComment, scope.parentId],
  );
  return (
    <View
      style={{ flex: 1, display: enabled ? 'flex' : 'none' }}
      accessibilityElementsHidden={!enabled}
      importantForAccessibility={enabled ? 'auto' : 'no-hide-descendants'}
    >
      <View
        style={{
          minHeight: 48,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 12,
        }}
      >
        {onBack ? (
          <Button size="sm" variant="ghost" onPress={onBack}>
            Back to comments
          </Button>
        ) : (
          <Text variant="label">Comments</Text>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={query.isFetching}
          onPress={() => void load('latest')}
        >
          {data?.headChanged ? 'Latest comments available' : 'Show latest'}
        </Button>
      </View>
      {query.isError ? (
        <View style={{ padding: 12 }}>
          <Text variant="bodySmall">
            {blocked
              ? 'This thread is unavailable.'
              : 'Couldn’t refresh comments. Previously loaded comments remain visible.'}
          </Text>
          <Button
            size="sm"
            variant="secondary"
            disabled={query.isFetching}
            onPress={() => void load(blocked ? 'latest' : query.lastIntent)}
          >
            Try again
          </Button>
        </View>
      ) : null}
      {query.isLoading ? (
        <ListRowsSkeleton rows={4} label="Loading comments" />
      ) : blocked ? null : (
        <>
          <FlatList
            key={generation.current.key}
            data={rows}
            renderItem={renderItem}
            keyExtractor={(row) => row.id}
            maintainVisibleContentPosition={anchor}
            viewabilityConfig={viewabilityConfig}
            onViewableItemsChanged={onViewableItemsChanged}
            onEndReached={() => tryPage('next')}
            onEndReachedThreshold={2}
            onStartReached={() => tryPage('previous')}
            onStartReachedThreshold={1}
            initialNumToRender={12}
            removeClippedSubviews={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ListHeaderComponent={
              <View>
                {scope.parentId && data?.parentRow ? renderComment(data.parentRow, false) : null}
                <View style={{ height: 44 }}>
                  {data?.pages[0]?.previous ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={query.isFetching}
                      onPress={() => void load('previous')}
                    >
                      Load previous comments
                    </Button>
                  ) : null}
                </View>
              </View>
            }
            ListFooterComponent={
              <View style={{ height: 52, alignItems: 'center', justifyContent: 'center' }}>
                {query.isFetching ? (
                  <ActivityIndicator color={colors.textSecondary} />
                ) : data?.pages.at(-1)?.next ? (
                  <Button size="sm" variant="ghost" onPress={() => void load('next')}>
                    Load more comments
                  </Button>
                ) : null}
              </View>
            }
            ListEmptyComponent={
              <Text variant="body" style={{ padding: 20 }}>
                No comments in this window.
              </Text>
            }
          />
        </>
      )}
    </View>
  );
}
