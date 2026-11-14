import type { QueryClient } from '@tanstack/react-query';
import type { Post } from '../types/database';

export const REACTION_CACHE_SETTLE_MS = 1_500;
export type ReactionWriteTiming = { reactionSettledAt?: number };

/** Keep newer local reaction feedback across reads begun before/during a write.
 * The existing scale cache is one second; a receipt gets the same bounded grace
 * as the scheduled reconciliation. No server record, permission or comment is held.
 */
export function preserveRecentReaction(
  client: QueryClient,
  userId: string,
  startedAt: number,
  incoming: Post,
  current?: Post | null,
): Post {
  if (!current) return incoming;
  const conflict = client
    .getMutationCache()
    .findAll({ mutationKey: ['toggleReaction', userId] })
    .some((mutation) => {
      const variables = mutation.state.variables as { postId?: string } | undefined;
      if (variables?.postId !== incoming.id) return false;
      const context = mutation.state.context as ReactionWriteTiming | undefined;
      return (
        mutation.state.status === 'pending' ||
        mutation.state.submittedAt >= startedAt ||
        (context?.reactionSettledAt !== undefined &&
          startedAt < context.reactionSettledAt + REACTION_CACHE_SETTLE_MS)
      );
    });
  return conflict
    ? {
        ...incoming,
        reaction_count: current.reaction_count,
        reaction_breakdown: current.reaction_breakdown,
        my_reactions: current.my_reactions,
      }
    : incoming;
}

/** Older commands cannot roll back or overwrite a newer choice on this post. */
export function isLatestReaction(
  client: QueryClient,
  userId: string,
  postId: string,
  context: unknown,
): boolean {
  return (
    client
      .getMutationCache()
      .findAll({ mutationKey: ['toggleReaction', userId] })
      .filter(
        (mutation) =>
          (mutation.state.variables as { postId?: string } | undefined)?.postId === postId,
      )
      .at(-1)?.state.context === context
  );
}

export function reactionFields(post: Post) {
  return {
    reaction_count: post.reaction_count,
    reaction_breakdown: post.reaction_breakdown,
    my_reactions: post.my_reactions,
  };
}
