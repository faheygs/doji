import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { RealtimeEventDeduper } from '../lib/realtimeDeduper';
import { refreshPostEngagement } from '../lib/postEngagement';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';
import type { FeedAudience } from '../lib/feedAudience';
import { startResilientRealtimeSubscription } from '../lib/resilientRealtimeSubscription';

/** Keep only visible, unlocked feed cards subscribed to their post channel. */
export function usePostRealtimeInvalidation(
  postId: string,
  enabled: boolean,
  feedAudience: FeedAudience = 'everyone',
) {
  const client = useQueryClient();
  const deduper = useRef(new RealtimeEventDeduper()).current;
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;
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
        if (refreshEngagement) tasks.push(refreshPostEngagement(client, postId, feedAudience));
        if (refreshComments)
          tasks.push(
            client.invalidateQueries(
              {
                predicate: (query) =>
                  query.queryKey[0] === 'comments' && query.queryKey[1] === postId,
                refetchType: 'active',
              },
              { cancelRefetch: false },
            ),
          );
        if (refreshReactions)
          tasks.push(
            client.invalidateQueries(
              {
                predicate: (query) =>
                  query.queryKey[0] === 'reactions' && query.queryKey[1] === postId,
                refetchType: 'active',
              },
              { cancelRefetch: false },
            ),
          );
        refreshEngagement = refreshComments = refreshReactions = false;
        inFlight = true;
        void Promise.allSettled(tasks).finally(() => {
          inFlight = false;
          if (refreshEngagement || refreshComments || refreshReactions) arm();
        });
      };
      const unsubscribe = startResilientRealtimeSubscription(
        `post:${postId}`,
        (event) => {
          if (!deduper.shouldProcess(event.eventId)) return;
          if (event.type.startsWith('feed.reaction.')) {
            refreshEngagement = true;
            refreshReactions = true;
          } else if (event.type.startsWith('feed.comment_like.')) {
            refreshComments = true;
          } else if (event.type.startsWith('feed.comment.')) {
            refreshEngagement = true;
            refreshComments = true;
          } else if (event.type.startsWith('poll.vote_like.')) {
            scheduleQueryInvalidation(client, ['pollVoteLikes', 'pollVotersDetail']);
            return;
          } else if (event.type.startsWith('poll.vote.')) {
            // The Friends tab receives a bounded user-channel fanout only when one
            // of this viewer's friends participates. Ignoring the global post hint
            // avoids every handset refetching friend-scoped totals for strangers.
            if (feedAudience === 'friends') return;
            scheduleQueryInvalidation(client, ['pollResults', 'pollVotersDetail']);
            return;
          } else {
            return;
          }
          arm();
        },
        // Close the read-to-subscribe race without a database read per mounted
        // card. Replayed IDs still pass through the same deduper and 80 ms batch.
        { rewind: '10s', scope: 'post' },
      );
      return () => {
        if (timer) clearTimeout(timer);
        unsubscribe();
      };
    }, [client, deduper, enabled, feedAudience, postId]),
  );
}
