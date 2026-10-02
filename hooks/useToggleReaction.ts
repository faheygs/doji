import { type InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query';
import { mapInfinitePosts } from '../lib/postCache';
import { newCommandId } from '../lib/idempotency';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';
import { useAuthStore } from '../stores/useAuthStore';
import type { Post, ReactionEmoji } from '../types/database';
import { refreshPostEngagement } from '../lib/postEngagement';
import type { FeedAudience } from '../lib/feedAudience';
import { executeCommand } from '../lib/commandGateway';

type ToggleReactionVars = {
  postId: string;
  emoji: ReactionEmoji;
  active: boolean;
  commandId?: string;
  feedAudience: FeedAudience;
};

type ToggleReactionResult = {
  post_id: string;
  emoji: ReactionEmoji;
  active: boolean;
  count: number;
  reaction_breakdown?: Post['reaction_breakdown'];
  current_emoji?: ReactionEmoji | null;
};

const ENGAGEMENT_CACHE_SETTLE_MS = 1_500;
const engagementRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleAuthoritativeEngagementRefresh(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string,
  postId: string,
  audience: FeedAudience,
) {
  const key = `${userId}:${postId}:${audience}`;
  const previous = engagementRefreshTimers.get(key);
  if (previous) clearTimeout(previous);
  engagementRefreshTimers.set(
    key,
    setTimeout(() => {
      engagementRefreshTimers.delete(key);
      if (useAuthStore.getState().session?.user.id !== userId) return;
      void refreshPostEngagement(queryClient, postId, audience).catch((error) => {
        if (__DEV__) console.warn('[reactions] engagement refresh failed', error);
      });
    }, ENGAGEMENT_CACHE_SETTLE_MS),
  );
}

export function patchReactionToggle(post: Post, emoji: ReactionEmoji, active: boolean): Post {
  const breakdown: Record<string, number> = { ...(post.reaction_breakdown ?? {}) };
  const previous = post.my_reactions?.[0] as ReactionEmoji | undefined;
  if (active) {
    breakdown[emoji] = Math.max(0, (breakdown[emoji] ?? 0) - 1);
    if (breakdown[emoji] === 0) delete breakdown[emoji];
    return {
      ...post,
      reaction_count: Math.max(0, post.reaction_count - 1),
      reaction_breakdown: breakdown,
      my_reactions: [],
    };
  }
  if (previous && previous !== emoji) {
    breakdown[previous] = Math.max(0, (breakdown[previous] ?? 0) - 1);
    if (breakdown[previous] === 0) delete breakdown[previous];
  }
  breakdown[emoji] = (breakdown[emoji] ?? 0) + 1;
  return {
    ...post,
    reaction_count: previous && previous !== emoji ? post.reaction_count : post.reaction_count + 1,
    reaction_breakdown: breakdown,
    my_reactions: [emoji],
  };
}

export function useToggleReaction() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.session?.user?.id);
  const isCurrentMember = () => !!userId && useAuthStore.getState().session?.user.id === userId;
  return useMutation({
    mutationKey: ['toggleReaction', userId],
    mutationFn: async (variables: ToggleReactionVars) => {
      if (!isCurrentMember()) throw new Error('Not authenticated');
      variables.commandId ??= newCommandId('reaction');
      const { data, error } = await executeCommand('set_post_reaction', {
        p_post_id: variables.postId,
        p_emoji: variables.emoji,
        p_active: !variables.active,
        p_idempotency_key: variables.commandId,
      });
      if (error) throw error;
      return data as ToggleReactionResult;
    },
    onMutate: (variables) => {
      if (!isCurrentMember()) return undefined;
      const previousFeeds = queryClient.getQueriesData<InfiniteData<Post[]>>({
        predicate: (query) => query.queryKey[0] === 'feed',
      });
      const previousPosts = queryClient.getQueriesData<Post | null>({
        predicate: (query) =>
          query.queryKey[0] === 'post' && query.queryKey[1] === variables.postId,
      });
      // Abort stale reads synchronously, but never make the first visual update
      // wait for an in-flight request to acknowledge cancellation.
      void queryClient.cancelQueries(
        {
          predicate: (query) =>
            query.queryKey[0] === 'feed' ||
            (query.queryKey[0] === 'post' && query.queryKey[1] === variables.postId),
        },
        { revert: false, silent: true },
      );
      const patch = (post: Post) => patchReactionToggle(post, variables.emoji, variables.active);
      queryClient.setQueriesData<InfiniteData<Post[]>>(
        { predicate: (query) => query.queryKey[0] === 'feed' },
        (old) => mapInfinitePosts(old, variables.postId, patch),
      );
      queryClient.setQueriesData<Post | null>(
        {
          predicate: (query) =>
            query.queryKey[0] === 'post' && query.queryKey[1] === variables.postId,
        },
        (old) => (old ? patch(old) : old),
      );
      return { previousFeeds, previousPosts };
    },
    onError: (_error, _variables, context) => {
      if (!isCurrentMember()) return;
      for (const [key, data] of context?.previousFeeds ?? []) queryClient.setQueryData(key, data);
      for (const [key, data] of context?.previousPosts ?? []) queryClient.setQueryData(key, data);
    },
    onSuccess: (result, variables) => {
      if (!result || !userId || !isCurrentMember()) return;
      const patchGlobal = (post: Post): Post => ({
        ...post,
        reaction_count: result.count,
        reaction_breakdown: result.reaction_breakdown ?? post.reaction_breakdown,
        my_reactions: result.current_emoji ? [result.current_emoji] : [],
      });
      const patchViewerState = (post: Post): Post => ({
        ...post,
        my_reactions: result.current_emoji ? [result.current_emoji] : [],
      });
      // The command receipt carries global totals. Applying those totals to a
      // Friends feed would briefly leak the Everyone count and then snap back
      // when the scoped snapshot arrives. Keep the optimistic friend-scoped
      // aggregate and only reconcile the viewer's selected reaction there.
      for (const [key, old] of queryClient.getQueriesData<InfiniteData<Post[]>>({
        predicate: (query) => query.queryKey[0] === 'feed',
      })) {
        const audience = key[2];
        queryClient.setQueryData(
          key,
          mapInfinitePosts(
            old,
            variables.postId,
            audience === 'everyone' ? patchGlobal : patchViewerState,
          ),
        );
      }
      queryClient.setQueriesData<Post | null>(
        {
          predicate: (query) =>
            query.queryKey[0] === 'post' && query.queryKey[1] === variables.postId,
        },
        (old) => (old ? patchGlobal(old) : old),
      );
      // The command receipt is the authoritative committed result. The scale
      // read cache intentionally lives for one second, so an immediate read can
      // still contain the pre-command snapshot and visually undo a reaction.
      // Reconcile after that bounded cache window; a newer toggle replaces this
      // timer so an older refresh cannot win over the user's latest choice.
      scheduleAuthoritativeEngagementRefresh(
        queryClient,
        userId,
        variables.postId,
        variables.feedAudience,
      );
    },
    onSettled: (_data, _error, variables) => {
      if (!isCurrentMember()) return;
      if (variables?.postId) {
        scheduleQueryInvalidation(queryClient, ['reactionsGiven', 'reactions', 'profile']);
      }
    },
  });
}
