import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  closeRealtimeConnection,
  onRealtimeConnectionChange,
  subscribeToRealtimeChannel,
  type DojiRealtimeEvent,
} from '../lib/realtimeClient';
import { RealtimeEventDeduper } from '../lib/realtimeDeduper';
import { useAuthStore } from '../stores/useAuthStore';
import { reconcileAppQueries } from '../lib/reconcileQueries';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';
import { realtimeQueryRoots } from '../lib/realtimeQueryRoots';
/** Ably transport plus authoritative Postgres reconciliation on every connection. */
export function useDomainRealtime(userId: string | undefined) {
  const queryClient = useQueryClient();
  const isAdmin = useAuthStore((state) => state.profile?.is_admin === true);
  const [deduper] = useState(() => new RealtimeEventDeduper());

  useEffect(() => {
    if (!userId) {
      deduper.clear();
      closeRealtimeConnection();
      return;
    }

    let disposed = false;
    let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribers: Array<() => void> = [];

    const reconcile = () => {
      if (reconcileTimer) clearTimeout(reconcileTimer);
      // Ably can emit multiple connected/update transitions during recovery.
      // Coalesce them into one authoritative catch-up instead of a query burst.
      reconcileTimer = setTimeout(() => {
        reconcileTimer = null;
        if (!disposed) void reconcileAppQueries(queryClient, { userId, isAdmin });
      }, 200);
    };

    const invalidateRoots = (...roots: string[]) => scheduleQueryInvalidation(queryClient, roots);

    const handleEvent = (event: DojiRealtimeEvent) => {
      if (!deduper.shouldProcess(event.eventId)) return;
      if (event.type.startsWith('doji.')) {
        invalidateRoots('upcomingDoji', 'userEvent', 'feed', 'notificationCenter');
        return;
      }

      if (event.type.startsWith('poll.vote.')) {
        invalidateRoots(...realtimeQueryRoots(event.type));
        return;
      }

      if (event.type.startsWith('poll.vote_like.')) {
        invalidateRoots(...realtimeQueryRoots(event.type));
        return;
      }

      if (event.type.startsWith('user_event.')) {
        invalidateRoots('userEvent', 'feed');
        return;
      }

      if (event.type.startsWith('shop.ownership.')) {
        invalidateRoots('ownedShopItems');
        void useAuthStore.getState().fetchProfile(userId);
        return;
      }

      if (event.type.startsWith('account.profile.')) {
        void useAuthStore.getState().fetchProfile(userId);
        invalidateRoots('profile');
        return;
      }

      if (event.type.startsWith('social.friendship.')) {
        invalidateRoots(
          'friends',
          'friendRequests',
          'friendship',
          'friendCount',
          'profileFriends',
          'feed',
          'notificationCenter',
        );
        return;
      }

      if (event.type.startsWith('social.block.')) {
        invalidateRoots('blockedUsers', 'isBlocked', 'profile', 'feed');
        return;
      }

      if (event.type.startsWith('notification.')) {
        const roots = ['notificationCenter'];
        if (event.type.startsWith('notification.suggestion.')) {
          roots.push('mySuggestions', 'challengeSuggestionCounts');
        }
        if (event.type.startsWith('notification.badge.')) {
          roots.push('userBadges', 'userBadgeProgress', 'profile');
        }
        invalidateRoots(...roots);
        return;
      }

      if (event.type === 'profile.updated' || event.type.startsWith('profile.presentation.')) {
        const changedUserId =
          typeof event.payload.userId === 'string' ? event.payload.userId : undefined;
        if (changedUserId === userId) {
          void useAuthStore.getState().fetchProfile(userId);
        }
        invalidateRoots(
          'profile',
          'searchUsers',
          'friends',
          'friendRequests',
          'profileFriends',
          'pollVotersDetail',
          'leaderboard',
          'comments',
          'reactions',
          'notificationCenter',
          'feed',
        );
        return;
      }

      if (event.type.startsWith('profile.stats.')) {
        const changedUserId =
          typeof event.payload.userId === 'string' ? event.payload.userId : undefined;
        if (changedUserId === userId) {
          void useAuthStore.getState().fetchProfile(userId);
        }
        invalidateRoots('profile', 'friends', 'leaderboard');
        return;
      }

      if (event.type === 'badge.updated') {
        const changedUserId =
          typeof event.payload.userId === 'string' ? event.payload.userId : undefined;
        invalidateRoots('userBadges', 'userBadgeProgress', 'profile');
        if (changedUserId === userId) {
          void useAuthStore.getState().fetchProfile(userId);
        }
        return;
      }

      if (event.type === 'leaderboard.updated') {
        invalidateRoots('leaderboard');
        return;
      }

      if (event.type.startsWith('moderation.report.')) {
        invalidateRoots('admin');
        return;
      }

      const feedRoots = realtimeQueryRoots(event.type);
      if (feedRoots.length > 0) invalidateRoots(...feedRoots);
    };

    const channelNames = ['doji:global', `user:${userId}:events`];
    if (isAdmin) channelNames.push('moderation:global');

    for (const channelName of channelNames) {
      void subscribeToRealtimeChannel(channelName, handleEvent)
        .then((unsubscribe) => {
          if (disposed) unsubscribe();
          else unsubscribers.push(unsubscribe);
        })
        .catch((error) => {
          if (__DEV__) console.warn('[realtime] subscribe failed', channelName, error);
        });
    }

    const removeConnectionListener = onRealtimeConnectionChange((change) => {
      if (change.current === 'connected') {
        reconcile();
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
