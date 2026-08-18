import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { subscribeToRealtimeChannel } from '../lib/realtimeClient';
import { RealtimeEventDeduper } from '../lib/realtimeDeduper';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';

type QueryRoots = readonly string[] | ((eventType: string) => readonly string[]);

/** Subscribe to high-volume public channels only while their screen is visible. */
export function useFocusedRealtimeInvalidation(
  channelName: string,
  queryRoots: QueryRoots,
  enabled = true,
) {
  const queryClient = useQueryClient();
  const [deduper] = useState(() => new RealtimeEventDeduper());
  const rootsKey = Array.isArray(queryRoots) ? queryRoots.join('|') : 'event-resolver';
  const queryRootsRef = useRef(queryRoots);
  useEffect(() => {
    queryRootsRef.current = queryRoots;
  }, [queryRoots, rootsKey]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;
      let disposed = false;
      let unsubscribe: (() => void) | undefined;
      void subscribeToRealtimeChannel(channelName, (event) => {
        if (!deduper.shouldProcess(event.eventId)) return;
        const configuredRoots = queryRootsRef.current;
        const roots =
          typeof configuredRoots === 'function' ? configuredRoots(event.type) : configuredRoots;
        if (roots.length > 0) scheduleQueryInvalidation(queryClient, roots);
      })
        .then((remove) => {
          if (disposed) remove();
          else unsubscribe = remove;
        })
        .catch((error) => {
          if (__DEV__) console.warn('[realtime] focused subscribe failed', channelName, error);
        });
      return () => {
        disposed = true;
        unsubscribe?.();
      };
    }, [channelName, deduper, enabled, queryClient]),
  );
}
