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

export function usePostReactions(postId: string, scopeUserIds?: string[]) {
  const session = useAuthStore((s) => s.session);
  const scopeKey = scopeUserIds?.slice().sort().join(',') ?? 'all';

  return useInfiniteQuery({
    queryKey: ['reactions', postId, scopeKey],
    queryFn: async ({ pageParam = 0 }): Promise<Reaction[]> => {
      let query = supabase
        .from('reactions')
        .select('*, profile:profiles(username, avatar_url, equipped_border_key)')
        .eq('post_id', postId)
        .order('created_at', { ascending: false })
        .range(pageParam * 50, (pageParam + 1) * 50 - 1);

      if (scopeUserIds && scopeUserIds.length > 0) {
        query = query.in('user_id', scopeUserIds);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Reaction[];
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === 50 ? allPages.length : undefined,
    initialPageParam: 0,
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
    onMutate: async (vars) => {
      const uid = session?.user?.id;
      if (!uid) return;

      await queryClient.cancelQueries({ predicate: (q) => q.queryKey[0] === 'feed' });

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
        scheduleQueryInvalidation(queryClient, ['reactionsGiven', 'reactions', 'feed', 'post']);
      }
    },
  });
}
