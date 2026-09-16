import AsyncStorage from '@react-native-async-storage/async-storage';
import { dehydrate, hydrate } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { AppState, InteractionManager } from 'react-native';
import { queryClient } from '../lib/queryClient';
import { useAuthStore } from '../stores/useAuthStore';
import {
  isPersistedQueryKey,
  queryCacheStorageKey,
  sanitizePersistedQueryData,
} from '../lib/queryPersistence';
import { initialSessionBootstrap } from '../lib/initialSessionBootstrap';

const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const HYDRATION_TIMEOUT_MS = 1_200;
const MAX_PERSISTED_QUERIES = 80;
const MAX_PERSISTED_QUERY_CHARS = 1_500_000;

type Snapshot = { savedAt: number; state: ReturnType<typeof dehydrate> };

function boundedSnapshot(): Snapshot {
  const state = dehydrate(queryClient, {
    shouldDehydrateQuery: (query) =>
      query.state.status === 'success' && isPersistedQueryKey(query.queryKey),
    shouldDehydrateMutation: () => false,
  });
  const candidates = state.queries
    .map((query) => ({
      ...query,
      state: {
        ...query.state,
        data: sanitizePersistedQueryData(query.state.data),
      },
    }))
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
  const queries: typeof state.queries = [];
  let persistedChars = 0;
  for (const query of candidates) {
    if (queries.length >= MAX_PERSISTED_QUERIES) break;
    const chars = JSON.stringify(query).length;
    if (persistedChars + chars > MAX_PERSISTED_QUERY_CHARS) continue;
    persistedChars += chars;
    queries.push(query);
  }
  return {
    savedAt: Date.now(),
    state: {
      ...state,
      mutations: [],
      queries,
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
    let hydrationTimer: ReturnType<typeof setTimeout> | undefined;
    let persistenceTask: ReturnType<typeof InteractionManager.runAfterInteractions> | undefined;
    let unsubscribe = () => {};
    let removeAppStateListener = () => {};
    let cacheUserId: string | undefined;

    const persistNow = () => {
      const userId = useAuthStore.getState().session?.user?.id;
      if (!userId) return;
      const snapshot = boundedSnapshot();
      void AsyncStorage.setItem(queryCacheStorageKey(userId), JSON.stringify(snapshot)).catch(
        () => {},
      );
    };

    const schedulePersistence = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        persistenceTask?.cancel();
        persistenceTask = InteractionManager.runAfterInteractions(() => {
          if (active) persistNow();
        });
      }, 2_000);
    };

    const cacheRead = initialSessionBootstrap.get().then(async (session) => {
      const userId = session?.user?.id;
      cacheUserId = userId;
      return {
        userId,
        raw: userId ? await AsyncStorage.getItem(queryCacheStorageKey(userId)) : null,
      };
    });
    const boundedCacheRead = Promise.race([
      cacheRead,
      new Promise<{ userId: undefined; raw: null }>((resolve) => {
        hydrationTimer = setTimeout(
          () => resolve({ userId: undefined, raw: null }),
          HYDRATION_TIMEOUT_MS,
        );
      }),
    ]);

    const restoreCache = ({ userId, raw }: { userId: string | undefined; raw: string | null }) => {
      cacheUserId = userId;
      if (!active || !raw) return;
      const snapshot = JSON.parse(raw) as Snapshot;
      if (Date.now() - snapshot.savedAt <= MAX_AGE_MS) {
        const restoredHashes = new Set(snapshot.state.queries.map((query) => query.queryHash));
        const newerHashes = new Set(
          snapshot.state.queries.flatMap((query) => {
            const existing = queryClient.getQueryCache().get(query.queryHash);
            return existing && existing.state.dataUpdatedAt > query.state.dataUpdatedAt
              ? [query.queryHash]
              : [];
          }),
        );
        hydrate(queryClient, snapshot.state);
        // Persisted data is a warm visual baseline, never authorization or
        // occurrence truth. Mark it stale so mounted surfaces reconcile in the
        // background without replacing the cached screen with a skeleton. A
        // late disk read never invalidates a newer network result.
        void queryClient.invalidateQueries({
          predicate: (query) =>
            restoredHashes.has(query.queryHash) && !newerHashes.has(query.queryHash),
          refetchType: 'none',
        });
      }
    };

    // The native splash handoff remains bounded, but a slow AsyncStorage read
    // must not be discarded. TanStack hydration keeps newer network results, so
    // a late snapshot can still warm queries that have not completed yet.
    void cacheRead.then(restoreCache).catch(() => {
      if (cacheUserId) return AsyncStorage.removeItem(queryCacheStorageKey(cacheUserId));
    });

    void boundedCacheRead
      .catch(() => ({ userId: undefined, raw: null }) as const)
      .finally(() => {
        if (hydrationTimer) clearTimeout(hydrationTimer);
        if (!active) return;
        setReady(true);
        unsubscribe = queryClient.getQueryCache().subscribe(schedulePersistence);
        const appStateSubscription = AppState.addEventListener('change', (state) => {
          if (state === 'active') return;
          // A user can background or close the app before the normal debounce
          // fires. Flush the latest first page while React Native still has a
          // lifecycle window instead of reopening with an older snapshot.
          if (timer) clearTimeout(timer);
          persistenceTask?.cancel();
          persistNow();
        });
        removeAppStateListener = () => appStateSubscription.remove();
      });

    return () => {
      active = false;
      if (hydrationTimer) clearTimeout(hydrationTimer);
      if (timer) clearTimeout(timer);
      persistenceTask?.cancel();
      unsubscribe();
      removeAppStateListener();
    };
  }, []);

  return ready ? <>{children}</> : null;
}
