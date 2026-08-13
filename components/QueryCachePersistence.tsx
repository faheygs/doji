import AsyncStorage from '@react-native-async-storage/async-storage';
import { dehydrate, hydrate } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { InteractionManager } from 'react-native';
import { queryClient } from '../lib/queryClient';

export const QUERY_CACHE_STORAGE_KEY = 'doji-query-cache-v2';
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const PERSISTED_ROOTS = new Set([
  'leaderboard',
  'shopCatalog',
  'upcomingDoji',
  'userEvent',
  'feed',
  'pollResults',
  'friendIds',
  'notificationCenter',
]);

type Snapshot = { savedAt: number; state: ReturnType<typeof dehydrate> };

function isSafeReferenceQuery(queryKey: readonly unknown[]) {
  return typeof queryKey[0] === 'string' && PERSISTED_ROOTS.has(queryKey[0]);
}

function boundedSnapshot(): Snapshot {
  const state = dehydrate(queryClient, {
    shouldDehydrateQuery: (query) =>
      query.state.status === 'success' && isSafeReferenceQuery(query.queryKey),
  });
  return {
    savedAt: Date.now(),
    state: {
      ...state,
      queries: state.queries.map((query) => {
        if (query.queryKey[0] !== 'feed') return query;
        const data = query.state.data as
          | { pages?: unknown[]; pageParams?: unknown[] }
          | undefined;
        if (!data?.pages) return query;
        return {
          ...query,
          state: {
            ...query.state,
            data: {
              ...data,
              pages: data.pages.slice(0, 1),
              pageParams: data.pageParams?.slice(0, 1),
            },
          },
        };
      }),
    },
  };
}

/**
 * Restores the last authorized screen immediately, then realtime/background
 * reconciliation refreshes it in place. Writes wait until interactions finish
 * so JSON serialization never competes with taps or scrolling.
 */
export function QueryCachePersistence({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let persistenceTask: ReturnType<typeof InteractionManager.runAfterInteractions> | undefined;
    let unsubscribe = () => {};

    void AsyncStorage.getItem(QUERY_CACHE_STORAGE_KEY)
      .then((raw) => {
        if (!active || !raw) return;
        const snapshot = JSON.parse(raw) as Snapshot;
        if (Date.now() - snapshot.savedAt <= MAX_AGE_MS) hydrate(queryClient, snapshot.state);
      })
      .catch(() => AsyncStorage.removeItem(QUERY_CACHE_STORAGE_KEY))
      .finally(() => {
        if (!active) return;
        setReady(true);
        unsubscribe = queryClient.getQueryCache().subscribe(() => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            persistenceTask?.cancel();
            persistenceTask = InteractionManager.runAfterInteractions(() => {
              if (!active) return;
              const snapshot = boundedSnapshot();
              void AsyncStorage.setItem(QUERY_CACHE_STORAGE_KEY, JSON.stringify(snapshot));
            });
          }, 2_000);
        });
      });

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      persistenceTask?.cancel();
      unsubscribe();
    };
  }, []);

  return ready ? <>{children}</> : null;
}
