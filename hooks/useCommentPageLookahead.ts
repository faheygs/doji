import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { focusManager, onlineManager } from '@tanstack/react-query';
import type { ViewToken } from 'react-native';
import type { CommentThreadRow } from '../lib/commentThread';
import type { CommentWithMeta } from './useComments';

const canRead = () => focusManager.isFocused() && onlineManager.isOnline();
const subscribe = (notify: () => void) => {
  const focus = focusManager.subscribe(notify);
  const online = onlineManager.subscribe(notify);
  return () => { focus(); online(); };
};
const viewabilityConfig = { itemVisiblePercentThreshold: 1 };

type Options = {
  scope: string;
  enabled: boolean;
  pages: CommentWithMeta[][] | undefined;
  hasNextPage: boolean;
  isFetching: boolean;
  isError: boolean;
  fetchNextPage: (options: { cancelRefetch: false }) => Promise<unknown>;
};

/** Prepare one cursor page beyond the visible page, not the entire thread. */
export function useCommentPageLookahead({
  scope, enabled, pages, hasNextPage, isFetching, isError, fetchNextPage,
}: Options) {
  const available = useSyncExternalStore(subscribe, canRead, canRead);
  const [visible, setVisible] = useState({ scope, page: 0 });
  const visiblePage = visible.scope === scope ? visible.page : 0;
  const attempted = useRef<string | null>(null);
  const pageById = useMemo(() => {
    const result = new Map<string, number>();
    pages?.forEach((page, index) => page.forEach(comment => result.set(comment.id, index)));
    return result;
  }, [pages]);
  const lastPage = pages?.at(-1);
  const last = lastPage?.at(-1);
  const cursor = JSON.stringify([scope, pages?.length, last?.created_at, last?.id]);
  const requestNextPage = useCallback(() => {
    if (!enabled || !canRead() || isFetching || isError || !hasNextPage || !last ||
      attempted.current === cursor) return;
    // Native end/viewability callbacks can arrive together before Query rerenders.
    // Keep failed cursors latched; only the explicit retry control retries errors.
    attempted.current = cursor;
    void fetchNextPage({ cancelRefetch: false }).catch(() => {});
  }, [cursor, enabled, fetchNextPage, hasNextPage, isError, isFetching, last]);

  useEffect(() => {
    if (!enabled || !available) {
      attempted.current = null;
      return;
    }
    if ((pages?.length ?? 0) <= visiblePage + 1) requestNextPage();
  }, [available, enabled, pages?.length, requestNextPage, visiblePage]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: {
    viewableItems: ViewToken<CommentThreadRow>[];
  }) => {
    if (!enabled) return;
    let page = 0;
    for (const token of viewableItems) {
      if (!token.isViewable) continue;
      const row = token.item;
      const id = row.kind === 'toggle' ? row.parentId : row.comment.id;
      page = Math.max(page, pageById.get(id) ?? 0);
    }
    setVisible(previous => previous.scope === scope && previous.page >= page
      ? previous : { scope, page });
  }, [enabled, pageById, scope]);

  return { onViewableItemsChanged, viewabilityConfig, onEndReached: requestNextPage };
}
