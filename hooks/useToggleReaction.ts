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
};

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
  return useMutation({
    mutationFn: async (variables: ToggleReactionVars) => {
      if (!userId) throw new Error('Not authenticated');
      variables.commandId ??= newCommandId('reaction');
      const { data, error } = await executeCommand('toggle_post_reaction', {
        p_post_id: variables.postId,
        p_emoji: variables.emoji,
        p_idempotency_key: variables.commandId,
      });
      if (error) throw error;
      return data as ToggleReactionResult;
    },
    onMutate: (variables) => {
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
      for (const [key, data] of context?.previousFeeds ?? []) queryClient.setQueryData(key, data);
      for (const [key, data] of context?.previousPosts ?? []) queryClient.setQueryData(key, data);
    },
    onSuccess: (result, variables) => {
      if (!result) return;
      const patch = (post: Post): Post => ({
        ...post,
        my_reactions: result.active ? [variables.emoji] : [],
      });
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
      void refreshPostEngagement(queryClient, variables.postId, variables.feedAudience).catch(
        (error) => {
          if (__DEV__) console.warn('[reactions] engagement refresh failed', error);
        },
      );
    },
    onSettled: (_data, _error, variables) => {
      if (variables?.postId) {
        scheduleQueryInvalidation(queryClient, ['reactionsGiven', 'reactions']);
      }
    },
  });
}
