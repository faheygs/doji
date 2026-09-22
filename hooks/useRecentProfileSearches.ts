import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addRecentProfileSearch,
  loadRecentProfileSearches,
  saveRecentProfileSearches,
  type RecentProfileSearch,
} from '../lib/recentProfileSearches';

export function useRecentProfileSearches(userId?: string) {
  const [recents, setRecents] = useState<RecentProfileSearch[]>([]);
  const versionRef = useRef(0);
  const writeRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    const loadVersion = ++versionRef.current;
    setRecents([]);
    if (userId) {
      void loadRecentProfileSearches(userId).then((loaded) => {
        if (active && versionRef.current === loadVersion) setRecents(loaded);
      });
    }
    return () => {
      active = false;
    };
  }, [userId]);

  const commit = useCallback(
    (update: (current: RecentProfileSearch[]) => RecentProfileSearch[]) => {
      if (!userId) return;
      versionRef.current += 1;
      setRecents((current) => {
        const next = update(current);
        writeRef.current = writeRef.current
          .then(() => saveRecentProfileSearches(userId, next))
          .catch(() => {});
        return next;
      });
    },
    [userId],
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

  return { recents, record, remove, clear };
}
