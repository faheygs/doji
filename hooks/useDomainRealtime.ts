import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  closeRealtimeConnection,
  onRealtimeConnectionChange,
  type DojiRealtimeEvent,
} from '../lib/realtimeClient';
import { RealtimeEventDeduper } from '../lib/realtimeDeduper';
import { useAuthStore } from '../stores/useAuthStore';
import { reconcileAppQueries } from '../lib/reconcileQueries';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';
import { handleDomainRealtimeEvent } from '../lib/domainRealtimeHandler';
import { startResilientRealtimeSubscription } from '../lib/resilientRealtimeSubscription';
/** Ably transport plus authoritative Postgres reconciliation on every connection. */
export function useDomainRealtime(userId: string | undefined) {
  const queryClient = useQueryClient();
  const isAdmin = useAuthStore((state) => state.profile?.is_admin === true);
  const [deduper] = useState(() => new RealtimeEventDeduper());
  const realtimeUserRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!userId) {
      realtimeUserRef.current = undefined;
      deduper.clear();
      closeRealtimeConnection();
      return;
    }
    if (realtimeUserRef.current && realtimeUserRef.current !== userId) {
      deduper.clear();
      closeRealtimeConnection();
    }
    realtimeUserRef.current = userId;

    let disposed = false;
    let hasConnected = false;
    let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribers: Array<() => void> = [];

    const reconcile = () => {
      if (reconcileTimer) clearTimeout(reconcileTimer);
      // Ably can emit multiple connected/update transitions during recovery.
      // Coalesce them into one authoritative catch-up instead of a query burst.
      reconcileTimer = setTimeout(
        () => {
          reconcileTimer = null;
          if (!disposed) void reconcileAppQueries(queryClient, { userId, isAdmin });
        },
        500 + Math.floor(Math.random() * 2_500),
      );
    };
    const invalidateRoots = (...roots: string[]) => scheduleQueryInvalidation(queryClient, roots);
    const handleEvent = (event: DojiRealtimeEvent) => {
      if (!deduper.shouldProcess(event.eventId)) return;
      handleDomainRealtimeEvent({ event, userId, queryClient, invalidateRoots });
    };

    const channelNames = ['doji:global', `user:${userId}:events`];
    if (isAdmin) channelNames.push('moderation:global');

    for (const channelName of channelNames) {
      unsubscribers.push(startResilientRealtimeSubscription(channelName, handleEvent, {
        // Initial reads and channel attachment are separate network operations.
        // Rewind closes that race without a second cold-start query waterfall.
        // These channels are deliberately low-volume (global Doji state,
        // viewer-scoped events, and admin moderation), so two minutes is bounded.
        rewind: '2m',
        scope: channelName === 'moderation:global' ? 'public' : 'app',
      }));
    }

    const removeConnectionListener = onRealtimeConnectionChange((change) => {
      if (change.current === 'connected') {
        // Initial screen queries are already authoritative. Reconciliation is
        // only needed after a connection recovery, and jitter prevents every
        // handset from refetching Postgres in the same millisecond.
        if (hasConnected) reconcile();
        else hasConnected = true;
      }
    });

    return () => {
      disposed = true;
      if (reconcileTimer) clearTimeout(reconcileTimer);
      removeConnectionListener();
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [deduper, isAdmin, queryClient, userId]);
}
