import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addRecentProfileSearch,
  addRecentSearchQuery,
  loadRecentProfileSearches,
  normalizeSearchQuery,
  saveRecentProfileSearches,
  type RecentProfileSearch,
  type RecentSearch,
} from '../lib/recentProfileSearches';

export function useRecentProfileSearches(userId?: string) {
  // Each account visit has its own fence, including A -> B -> A transitions.
  const scope = useMemo(
    () => ({ userId, active: false, version: 0, items: [] as RecentSearch[] }),
    [userId],
  );
  const [state, setState] = useState({ scope, items: scope.items });
  const writeRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    scope.active = true;
    const loadVersion = ++scope.version;
    if (userId) {
      void writeRef.current
        .then(() => loadRecentProfileSearches(userId))
        .then((loaded) => {
          if (scope.active && scope.version === loadVersion) {
            scope.items = loaded;
            setState({ scope, items: loaded });
          }
        })
        .catch(() => {});
    }
    return () => {
      scope.active = false;
    };
  }, [scope, userId]);

  const commit = useCallback(
    (update: (current: RecentSearch[]) => RecentSearch[]) => {
      if (!userId || !scope.active) return;
      scope.version += 1;
      const next = update(scope.items);
      scope.items = next;
      setState({ scope, items: next });
      // Keep persistence outside React state updaters, which may be replayed.
      writeRef.current = writeRef.current
        .then(() => saveRecentProfileSearches(userId, next))
        .catch(() => {});
    },
    [scope, userId],
  );

  const record = useCallback(
    (profile: RecentProfileSearch) => commit((current) => addRecentProfileSearch(current, profile)),
    [commit],
  );
  const remove = useCallback(
    (profileId: string) => commit((current) => current.filter((item) => item.id !== profileId)),
    [commit],
  );
  const clear = useCallback(() => commit(() => []), [commit]);
  const recordQuery = useCallback(
    (query: string) => {
      if (normalizeSearchQuery(query).length >= 2)
        commit((current) => addRecentSearchQuery(current, query));
    },
    [commit],
  );

  return { recents: state.scope === scope ? state.items : [], record, recordQuery, remove, clear };
}
