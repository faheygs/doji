import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { subscribeToRealtimeChannel } from '../lib/realtimeClient';
import { RealtimeEventDeduper } from '../lib/realtimeDeduper';
import { refreshPostEngagement } from '../lib/postEngagement';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';

/** Keep only visible, unlocked feed cards subscribed to their post channel. */
export function usePostRealtimeInvalidation(postId: string, enabled: boolean) {
  const client = useQueryClient();
  const deduper = useRef(new RealtimeEventDeduper()).current;
  useFocusEffect(useCallback(() => {
    if (!enabled) return undefined;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    let refreshEngagement = false;
    let refreshComments = false;
    let refreshReactions = false;
    const arm = () => {
      if (!timer && !inFlight) timer = setTimeout(flush, 80);
    };
    const flush = () => {
      timer = null;
      const tasks: Promise<unknown>[] = [];
      if (refreshEngagement) tasks.push(refreshPostEngagement(client, postId));
      if (refreshComments) tasks.push(client.invalidateQueries({
          predicate: (query) => query.queryKey[0] === 'comments' && query.queryKey[1] === postId,
          refetchType: 'active',
        }, { cancelRefetch: false }));
      if (refreshReactions) tasks.push(client.invalidateQueries({
        predicate: (query) => query.queryKey[0] === 'reactions' && query.queryKey[1] === postId,
        refetchType: 'active',
      }, { cancelRefetch: false }));
      refreshEngagement = refreshComments = refreshReactions = false;
      inFlight = true;
      void Promise.allSettled(tasks).finally(() => {
        inFlight = false;
        if (refreshEngagement || refreshComments || refreshReactions) arm();
      });
    };
    void subscribeToRealtimeChannel(`post:${postId}`, (event) => {
      if (!deduper.shouldProcess(event.eventId)) return;
      if (event.type.startsWith('feed.reaction.')) {
        refreshEngagement = true; refreshReactions = true;
      } else if (event.type.startsWith('feed.comment_like.')) {
        refreshComments = true;
      } else if (event.type.startsWith('feed.comment.')) {
        refreshEngagement = true; refreshComments = true;
      } else if (event.type.startsWith('poll.vote_like.')) {
        scheduleQueryInvalidation(client, ['pollVoteLikes', 'pollVotersDetail']);
        return;
      } else if (event.type.startsWith('poll.vote.')) {
        scheduleQueryInvalidation(client, ['pollResults', 'pollVotersDetail', 'feed']);
        return;
      } else {
        return;
      }
      arm();
    }).then((remove) => disposed ? remove() : (unsubscribe = remove)).catch((error) => {
      if (__DEV__) console.warn('[realtime] post subscription failed', postId, error);
    });
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      unsubscribe?.();
    };
  }, [client, deduper, enabled, postId]));
}
