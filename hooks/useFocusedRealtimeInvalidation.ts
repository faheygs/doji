import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { RealtimeEventDeduper } from '../lib/realtimeDeduper';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';
import { startResilientRealtimeSubscription } from '../lib/resilientRealtimeSubscription';

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
      const unsubscribe = startResilientRealtimeSubscription(
        channelName,
        (event) => {
          if (!deduper.shouldProcess(event.eventId)) return;
          const configuredRoots = queryRootsRef.current;
          const roots =
            typeof configuredRoots === 'function' ? configuredRoots(event.type) : configuredRoots;
          if (roots.length > 0) scheduleQueryInvalidation(queryClient, roots);
        },
        // Public feeds can be high-volume. Ten seconds is enough to close the
        // screen read-to-subscribe race without replaying an unbounded burst.
        { rewind: '10s', scope: 'public' },
      );
      return () => {
        unsubscribe();
      };
    }, [channelName, deduper, enabled, queryClient]),
  );
}
