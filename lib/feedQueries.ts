import { supabase } from './supabase';
import { type FeedAudience } from './feedAudience';
import { createRequestSignal } from './requestSignal';
import { readThroughScaleGateway } from './scaleReadGateway';
import type { Post } from '../types/database';

export const FEED_PAGE_SIZE = 20;
export type FeedPageParam = {
  offset: number;
  beforeCreatedAt?: string;
  beforeId?: string;
};

export function nextFeedPage(
  lastPage: Post[],
  _allPages: Post[][],
  previous: FeedPageParam,
): FeedPageParam | undefined {
  if (lastPage.length < FEED_PAGE_SIZE) return undefined;
  const lastPost = lastPage[lastPage.length - 1];
  return {
    offset: previous.offset + FEED_PAGE_SIZE,
    beforeCreatedAt: lastPost.created_at,
    beforeId: lastPost.id,
  };
}

type FeedPageContext = {
  userId: string;
  dailyEventId: string;
  audience: FeedAudience;
  friendIds?: string[];
  unlocked: boolean;
};

/** Fetch one page for the single server-authoritative Doji occurrence. */
export async function fetchFeedPostsPage(
  context: FeedPageContext,
  page: FeedPageParam,
  signal?: AbortSignal,
): Promise<Post[]> {
  const { dailyEventId, audience, unlocked } = context;
  const eventIds = [dailyEventId];
  const request = createRequestSignal(signal);

  try {
    if (!unlocked) {
      const path = `/v1/feed/${encodeURIComponent(dailyEventId)}?audience=${audience}&unlocked=false&limit=${FEED_PAGE_SIZE}&offset=${page.offset}`;
      return readThroughScaleGateway<Post[]>(
        path,
        async () => {
          const { data, error } = await supabase
            .rpc('get_locked_feed_previews', {
              p_daily_event_ids: eventIds,
              p_audience: audience,
              p_limit: FEED_PAGE_SIZE,
              p_offset: page.offset,
            })
            .abortSignal(request.signal);
          if (error) throw error;
          return (Array.isArray(data) ? data : []) as Post[];
        },
        request.signal,
      );
    }

    const cursor = new URLSearchParams({
      audience,
      unlocked: 'true',
      limit: String(FEED_PAGE_SIZE),
    });
    if (page.beforeCreatedAt) cursor.set('beforeCreatedAt', page.beforeCreatedAt);
    if (page.beforeId) cursor.set('beforeId', page.beforeId);
    const path = `/v1/feed/${encodeURIComponent(dailyEventId)}?${cursor.toString()}`;
    return readThroughScaleGateway<Post[]>(
      path,
      async () => {
        const { data, error } = await supabase
          .rpc('get_feed_page_snapshot_v2', {
            p_daily_event_id: dailyEventId,
            p_audience: audience,
            p_limit: FEED_PAGE_SIZE,
            p_before_created_at: page.beforeCreatedAt ?? null,
            p_before_id: page.beforeId ?? null,
          })
          .abortSignal(request.signal);
        if (error) throw error;
        // Return the authorized social records immediately. Private media object
        // references are signed lazily by visible cards so Storage latency cannot
        // hold the entire feed behind a loading skeleton.
        return (Array.isArray(data) ? data : []) as Post[];
      },
      request.signal,
    );
  } finally {
    request.cleanup();
  }
}
