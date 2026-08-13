import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { subscribeToRealtimeChannel } from '../lib/realtimeClient';
import { RealtimeEventDeduper } from '../lib/realtimeDeduper';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';

/** Subscribe to high-volume public channels only while their screen is visible. */
export function useFocusedRealtimeInvalidation(
  channelName: string,
  queryRoots: string[],
  enabled = true,
) {
  const queryClient = useQueryClient();
  const [deduper] = useState(() => new RealtimeEventDeduper());
  const rootsKey = queryRoots.join('|');

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;
      let disposed = false;
      let unsubscribe: (() => void) | undefined;
      void subscribeToRealtimeChannel(channelName, (event) => {
        if (!deduper.shouldProcess(event.eventId)) return;
        scheduleQueryInvalidation(queryClient, queryRoots);
      }).then((remove) => {
        if (disposed) remove();
        else unsubscribe = remove;
      }).catch((error) => {
        if (__DEV__) console.warn('[realtime] focused subscribe failed', channelName, error);
      });
      return () => {
        disposed = true;
        unsubscribe?.();
      };
    }, [channelName, deduper, enabled, queryClient, rootsKey]),
  );
}
