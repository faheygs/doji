import {
  type InfiniteData,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { type FeedAudience } from '../lib/feedAudience';
import { fetchFeedPostsPage, nextFeedPage, type FeedPageParam } from '../lib/feedQueries';
import { useAuthStore } from '../stores/useAuthStore';
import { newCommandId } from '../lib/idempotency';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';
import type { Post, Reaction, ReactionEmoji } from '../types/database';
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
    queryFn: async ({ pageParam }): Promise<Reaction[]> => {
      const { data, error } = await supabase.rpc('get_post_reaction_voters_page', {
        p_post_id: postId,
        p_audience: audience,
        p_limit: 50,
        p_before_created_at: pageParam?.createdAt ?? null,
        p_before_id: pageParam?.id ?? null,
      });

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

type ToggleReactionVars = {
  postId: string;
  emoji: ReactionEmoji;
  active: boolean;
  commandId?: string;
};

function patchReactionToggle(
  post: Post,
  emoji: ReactionEmoji,
  active: boolean,
): Post {
  const bd: Record<string, number> = { ...(post.reaction_breakdown ?? {}) };
  const prevMy = (post.my_reactions ?? [])[0] as ReactionEmoji | undefined;

  if (active) {
    bd[emoji] = Math.max(0, (bd[emoji] ?? 0) - 1);
    if (bd[emoji] <= 0) delete bd[emoji];
    return {
      ...post,
      reaction_count: Math.max(0, post.reaction_count - 1),
      reaction_breakdown: bd,
      my_reactions: [],
    };
  }

  for (const k of Object.keys(bd)) {
    const key = k as ReactionEmoji;
    if (prevMy && key === prevMy && key !== emoji) {
      bd[key] = Math.max(0, (bd[key] ?? 0) - 1);
      if (bd[key] <= 0) delete bd[key];
    }
  }
  bd[emoji] = (bd[emoji] ?? 0) + 1;
  const replacing = Boolean(prevMy && prevMy !== emoji);
  return {
    ...post,
    reaction_count: replacing ? post.reaction_count : post.reaction_count + 1,
    reaction_breakdown: bd,
    my_reactions: [emoji],
  };
}

export function mapInfinitePosts(
  old: InfiniteData<Post[]> | undefined,
  postId: string,
  patch: (p: Post) => Post,
): InfiniteData<Post[]> | undefined {
  if (!old) return old;
  return {
    ...old,
    pages: old.pages.map((page) => page.map((p) => (p.id === postId ? patch(p) : p))),
  };
}

export function useToggleReaction() {
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);

  return useMutation({
    mutationFn: async (variables: ToggleReactionVars) => {
      const { postId, emoji } = variables;
      const uid = session?.user?.id;
      if (!uid) throw new Error('Not authenticated');
      variables.commandId ??= newCommandId('reaction');
      const { data, error } = await supabase.rpc('toggle_post_reaction', {
        p_post_id: postId,
        p_emoji: emoji,
        p_idempotency_key: variables.commandId,
      });
      if (error) throw error;
      return data;
    },
    onMutate: (vars) => {
      const uid = session?.user?.id;
      if (!uid) return;

      const previousFeedQueries = queryClient.getQueriesData<InfiniteData<Post[]>>({
        predicate: (q) => q.queryKey[0] === 'feed',
      });

      queryClient.setQueriesData<InfiniteData<Post[]>>(
        { predicate: (q) => q.queryKey[0] === 'feed' },
        (old) => mapInfinitePosts(old, vars.postId, (p) => patchReactionToggle(p, vars.emoji, vars.active)),
      );

      return { previousFeedQueries, uid };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx?.previousFeedQueries) return;
      for (const [queryKey, data] of ctx.previousFeedQueries) {
        queryClient.setQueryData(queryKey, data);
      }
    },
    onSuccess: (result, vars) => {
      if (!result) return;
      queryClient.setQueriesData<InfiniteData<Post[]>>(
        { predicate: (q) => q.queryKey[0] === 'feed' },
        (old) => mapInfinitePosts(old, vars.postId, (post) => ({
          ...post,
          reaction_count: result.count,
          my_reactions: result.active ? [vars.emoji] : [],
        })),
      );
    },
    onSettled: (_data, _error, vars) => {
      if (vars?.postId) {
        scheduleQueryInvalidation(queryClient, ['reactionsGiven', 'reactions', 'post']);
      }
    },
  });
}
