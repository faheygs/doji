import {
  type InfiniteData,
  type QueryClient,
  useInfiniteQuery,
} from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { type FeedAudience } from '../lib/feedAudience';
import { fetchFeedPostsPage, nextFeedPage, type FeedPageParam } from '../lib/feedQueries';
import { useAuthStore } from '../stores/useAuthStore';
import type { Post, Reaction } from '../types/database';
import { runAbortableQuery } from '../lib/requestSignal';
export { useToggleReaction } from './useToggleReaction';
export type { FeedAudience };
type FeedQueryArgs = {
  userId: string;
  dailyEventId: string;
  audience: FeedAudience;
  unlocked: boolean;
};

type FeedKey = [
  'feed',
  string | undefined,
  FeedAudience,
  string | undefined,
  'full' | 'locked',
];

const feedKey = ({
  userId,
  dailyEventId,
  audience,
  unlocked,
}: Omit<FeedQueryArgs, 'userId' | 'dailyEventId'> & {
  userId?: string;
  dailyEventId?: string;
}): FeedKey => ['feed', dailyEventId, audience, userId, unlocked ? 'full' : 'locked'];

/** Warms the adjacent audience after the visible feed settles. */
export function prefetchFeedAudience(client: QueryClient, args: FeedQueryArgs) {
  return client.prefetchInfiniteQuery({
    queryKey: feedKey(args),
    queryFn: ({ pageParam, signal }) =>
      fetchFeedPostsPage(args, pageParam ?? { offset: 0 }, signal),
    getNextPageParam: nextFeedPage,
    initialPageParam: { offset: 0 },
    staleTime: 60_000,
  });
}

/**
 * Today's live feed for the selected audience.
 * Friends: posts from mutual friends (+ self), poll results scoped to that network.
 * Everyone: all eligible posts from today's completers and full poll results.
 */
export function useFeed(
  audience: FeedAudience = 'friends',
  unlocked: boolean | undefined = undefined,
  dailyEventId: string | undefined = undefined,
) {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id;

  return useInfiniteQuery<
    Post[],
    Error,
    InfiniteData<Post[], FeedPageParam>,
    FeedKey,
    FeedPageParam
  >({
    queryKey: feedKey({
      userId,
      dailyEventId,
      audience,
      unlocked: unlocked === true,
    }),
    queryFn: async ({ pageParam, signal }): Promise<Post[]> => {
      if (!userId || !dailyEventId) return [];
      return fetchFeedPostsPage(
        { userId, dailyEventId, audience, unlocked: unlocked === true },
        pageParam ?? { offset: 0 },
        signal,
      );
    },
    getNextPageParam: nextFeedPage,
    initialPageParam: { offset: 0 },
    enabled: !!userId && !!dailyEventId && unlocked !== undefined,
    staleTime: 60_000,
  });
}

export function usePostReactions(postId: string, audience: FeedAudience = 'everyone') {
  const session = useAuthStore((s) => s.session);

  return useInfiniteQuery({
    queryKey: ['reactions', postId, audience],
    queryFn: async ({ pageParam, signal }): Promise<Reaction[]> => {
      const { data, error } = await runAbortableQuery(supabase.rpc('get_post_reaction_voters_page', {
        p_post_id: postId,
        p_audience: audience,
        p_limit: 50,
        p_before_created_at: pageParam?.createdAt ?? null,
        p_before_id: pageParam?.id ?? null,
      }), signal);

      if (error) throw error;
      return (data ?? []) as Reaction[];
    },
    getNextPageParam: (lastPage) => {
      const tail = lastPage.at(-1);
      return lastPage.length === 50 && tail
        ? { createdAt: tail.created_at, id: tail.id }
        : undefined;
    },
    initialPageParam: null as { createdAt: string; id: string } | null,
    enabled: !!session?.user?.id && !!postId,
  });
}
