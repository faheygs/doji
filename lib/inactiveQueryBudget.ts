import type { Query, QueryClient } from '@tanstack/react-query';
import { isPersistedQueryKey } from './queryPersistence';

export const INACTIVE_QUERY_LIMIT = 80;
export const INACTIVE_PAGE_LIMIT = 120;
export const INACTIVE_PAGES_PER_QUERY = 5;

function pages(query: Query): number {
  const data = query.state.data;
  return data && typeof data === 'object' && 'pages' in data && Array.isArray(data.pages)
    ? Math.max(1, data.pages.length) : 1;
}

/** Bound unused social snapshots, never a mounted viewport or mutation rollback. */
export function installInactiveQueryBudget(client: QueryClient): () => void {
  const cache = client.getQueryCache();
  const recency = new WeakMap<Query, number>();
  let sequence = 0;
  let queued = false;
  let disposed = false;
  const eligible = (query: Query) => isPersistedQueryKey(query.queryKey)
    && query.getObserversCount() === 0 && query.state.fetchStatus === 'idle';

  const sweep = () => {
    queued = false;
    if (disposed || client.isMutating()) return;
    const unused = cache.getAll().filter(eligible)
      .sort((a, b) => (recency.get(a) ?? 0) - (recency.get(b) ?? 0));
    let count = unused.length;
    let retainedPages = unused.reduce((total, query) => total + pages(query), 0);
    // Drop whole abandoned queries: trimming live cursors can skip rows or move
    // a viewport. A deep list reopened after eviction starts at its initial page.
    for (const query of unused) {
      if (pages(query) <= INACTIVE_PAGES_PER_QUERY || !eligible(query)) continue;
      cache.remove(query);
      count -= 1;
      retainedPages -= pages(query);
    }
    for (const query of unused) {
      if (count <= INACTIVE_QUERY_LIMIT && retainedPages <= INACTIVE_PAGE_LIMIT) break;
      if (cache.get(query.queryHash) !== query || !eligible(query)) continue;
      cache.remove(query);
      count -= 1;
      retainedPages -= pages(query);
    }
  };
  const schedule = () => {
    if (queued || disposed) return;
    queued = true;
    // Let same-turn mount/reattach and hydration finish; no periodic cache scan.
    void Promise.resolve().then(sweep);
  };
  const stopQueries = cache.subscribe(event => {
    if (!isPersistedQueryKey(event.query.queryKey)) return;
    if (event.type === 'added' || event.type === 'observerAdded'
      || event.type === 'observerRemoved'
      || (event.type === 'updated' && event.action.type === 'success')) {
      recency.set(event.query, ++sequence);
    }
    if (event.type === 'added' || event.type === 'observerRemoved' || event.type === 'updated') schedule();
  });
  const stopMutations = client.getMutationCache().subscribe(schedule);
  schedule();
  return () => {
    disposed = true;
    stopQueries();
    stopMutations();
  };
}
