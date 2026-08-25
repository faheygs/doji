import AsyncStorage from '@react-native-async-storage/async-storage';
import { dehydrate, hydrate } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { InteractionManager } from 'react-native';
import { queryClient } from '../lib/queryClient';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import { queryCacheStorageKey } from '../lib/queryPersistence';

const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const HYDRATION_TIMEOUT_MS = 1_200;
const PERSISTED_ROOTS = new Set([
  'leaderboard',
  'shopCatalog',
  'upcomingDoji',
  'userEvent',
  'feed',
  'pollResults',
  'notificationCenter',
]);

type Snapshot = { savedAt: number; state: ReturnType<typeof dehydrate> };

type PersistedPost = {
  photo_url?: unknown;
  front_photo_url?: unknown;
  video_url?: unknown;
  [key: string]: unknown;
};

function stripExpiringMedia(page: unknown): unknown {
  if (!Array.isArray(page)) return page;
  return page.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const post = item as PersistedPost;
    return {
      ...post,
      photo_url: post.photo_url ? null : post.photo_url,
      front_photo_url: post.front_photo_url ? null : post.front_photo_url,
      video_url: post.video_url ? null : post.video_url,
    };
  });
}

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
              // Signed media URLs are short-lived bearer capabilities. Never
              // persist them beyond their authorization window; the first
              // background reconciliation signs currently authorized objects.
              pages: data.pages.slice(0, 1).map(stripExpiringMedia),
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
    let hydrationTimer: ReturnType<typeof setTimeout> | undefined;
    let persistenceTask: ReturnType<typeof InteractionManager.runAfterInteractions> | undefined;
    let unsubscribe = () => {};
    let cacheUserId: string | undefined;

    const cacheRead = supabase.auth.getSession().then(async ({ data }) => {
      const userId = data.session?.user?.id;
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

    void boundedCacheRead
      .then(({ userId, raw }) => {
        if (!active || !raw) return;
        const snapshot = JSON.parse(raw) as Snapshot;
        if (Date.now() - snapshot.savedAt <= MAX_AGE_MS) {
          hydrate(queryClient, snapshot.state);
          // Persisted data is a warm visual baseline, never authorization or
          // occurrence truth. Mark it stale before screens mount so each active
          // surface reconciles in the background without flashing empty UI.
          void queryClient.invalidateQueries({
            predicate: (query) => isSafeReferenceQuery(query.queryKey),
            refetchType: 'none',
          });
        }
      })
      .catch(() => {
        if (cacheUserId) return AsyncStorage.removeItem(queryCacheStorageKey(cacheUserId));
      })
      .finally(() => {
        if (hydrationTimer) clearTimeout(hydrationTimer);
        if (!active) return;
        setReady(true);
        unsubscribe = queryClient.getQueryCache().subscribe(() => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            persistenceTask?.cancel();
            persistenceTask = InteractionManager.runAfterInteractions(() => {
              if (!active) return;
              const userId = useAuthStore.getState().session?.user?.id;
              if (!userId) return;
              const snapshot = boundedSnapshot();
              void AsyncStorage.setItem(
                queryCacheStorageKey(userId),
                JSON.stringify(snapshot),
              ).catch(() => {});
            });
          }, 2_000);
        });
      });

    return () => {
      active = false;
      if (hydrationTimer) clearTimeout(hydrationTimer);
      if (timer) clearTimeout(timer);
      persistenceTask?.cancel();
      unsubscribe();
    };
  }, []);

  return ready ? <>{children}</> : null;
}
