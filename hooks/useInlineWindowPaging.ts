import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { useCommentWindow } from './useCommentWindow';
import type { CommentReadIntent } from '../lib/commentWindowReads';

export type WindowController = ReturnType<typeof useCommentWindow>;

/** Only viewport-adjacent pages are prepared. A deferred eviction is reconsidered
 * when viewability changes, not in a render/refetch retry loop. */
export function useInlineWindowPaging(
  query: WindowController,
  enabled: boolean,
  visible: ReadonlySet<string>,
  atHead = false,
) {
  const attempted = useRef(new Map<string, string>());
  const generation = useRef(query.data?.generation);
  const current = useRef({ query, enabled, visible, atHead });
  current.current = { query, enabled, visible, atHead };
  query.visibleIds.current = visible;
  query.headRefreshAllowed.current = atHead;
  const dirtyRoots = useMemo(
    () =>
      new Set(
        query.data?.retainLoadedRoots
          ? query.data.pages
              .filter((page) => page.needsRefresh)
              .flatMap((page) => page.items.map((row) => row.id))
          : [],
      ),
    [query.data],
  );
  const load = useCallback((intent: CommentReadIntent, retry = false) => {
    const { query: q, enabled: active, visible: ids, atHead: top } = current.current;
    if (!active || !q.available || q.isFetching || (q.isError && !retry)) return;
    const data = q.data;
    if (generation.current !== data?.generation) {
      attempted.current.clear();
      generation.current = data?.generation;
    }
    if (!retry && (intent === 'next' || intent === 'previous' || intent === 'tail')) {
      const pages = data?.pages ?? [];
      if (intent === 'next' && !pages.at(-1)?.next) return;
      if (intent === 'previous' && !pages[0]?.previous) return;
      if (pages.length >= 3 && !data?.retainLoadedRoots) {
        const edge = intent === 'previous' ? pages.at(-1) : pages[0];
        if (!ids.size || edge?.items.some((row) => ids.has(row.id))) return;
      }
    }
    if (intent === 'latest' && !retry && !data?.scope.parentId && !top) return;
    const token = `${data?.revision}:${[...ids].join(',')}:${top}`;
    if (!retry && attempted.current.get(intent) === token) return;
    attempted.current.set(intent, token);
    void q.load(intent);
  }, []);
  useEffect(() => {
    const data = query.data;
    if (!data || !enabled) return;
    const rows = data.retainLoadedRoots
      ? [...(data.pages[0]?.items ?? []), ...(data.pages.at(-1)?.items ?? [])]
      : data.pages.flatMap((page) => page.items);
    const indexes = rows.flatMap((row, index) => (visible.has(row.id) ? [index] : []));
    const first = Math.min(...indexes),
      last = Math.max(...indexes);
    if (data.retainLoadedRoots && [...visible].some((id) => dirtyRoots.has(id))) {
      load('visible');
      return;
    }
    if (!data.scope.parentId && data.headChanged && atHead && !data.pages[0]?.previous) {
      load('latest');
      return;
    }
    if (
      data.scope.parentId &&
      data.headChanged &&
      !data.pages.at(-1)?.next &&
      (last === rows.length - 1 || rows.length === 0)
    ) {
      load(rows.length ? 'tail' : 'latest');
      return;
    }
    if (!data.retainLoadedRoots && first < 5 && data.pages[0]?.previous) {
      load('previous');
      return;
    }
    if (data.pages.length === 1 || last >= rows.length - 5) load('next');
  }, [
    query.data,
    query.isFetching,
    query.isError,
    query.available,
    enabled,
    visible,
    atHead,
    load,
    dirtyRoots,
  ]);
  return load;
}
