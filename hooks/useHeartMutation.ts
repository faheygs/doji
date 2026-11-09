import { type InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query';
import { captureProfileAccount, useAuthStore } from '../stores/useAuthStore';
import { executeCommand } from '../lib/commandGateway';
import { newCommandId } from '../lib/idempotency';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';
import {
  heartMutationKey,
  heartQueryOwnedBy,
  heartRowId,
  heartState,
  latestHeart,
  patchHeart,
  type HeartKind,
  type HeartRow,
} from '../lib/heartConsistency';

type Variables = { liked: boolean; commandId?: string; postId?: string };

/** Shared command/read ordering for every binary heart control. */
export function useHeartMutation<V extends Variables>(
  kind: HeartKind,
  identify: (vars: V) => string,
) {
  const client = useQueryClient();
  const userId = useAuthStore((state) => state.session?.user.id);
  return useMutation({
    mutationKey: heartMutationKey(kind, userId),
    mutationFn: async (vars: V) => {
      if (!userId || useAuthStore.getState().session?.user.id !== userId)
        throw new Error('Not authenticated');
      vars.commandId ??= newCommandId(kind === 'comment' ? 'comment-like' : 'poll-vote-like');
      const result =
        kind === 'comment'
          ? await executeCommand('set_comment_like', {
              p_comment_id: identify(vars),
              p_active: !vars.liked,
              p_idempotency_key: vars.commandId,
            })
          : await executeCommand('set_poll_vote_like', {
              p_poll_vote_id: identify(vars),
              p_active: !vars.liked,
              p_idempotency_key: vars.commandId,
            });
      if (result.error) throw result.error;
      return result.data as { active: boolean; count: number } | null;
    },
    onMutate: (vars: V) => {
      const account = captureProfileAccount();
      if (!userId || account.userId !== userId) return undefined;
      const id = identify(vars);
      const predicate = (query: { queryKey: readonly unknown[] }) =>
        heartQueryOwnedBy(kind, query.queryKey, userId) &&
        (kind !== 'comment' || query.queryKey[1] === vars.postId);
      const previous = client.getQueriesData<InfiniteData<HeartRow[]>>({ predicate });
      void client.cancelQueries({ predicate }, { revert: false, silent: true });
      client.setQueriesData<InfiniteData<HeartRow[]>>({ predicate }, (old) =>
        patchHeart(old, kind, id, (row) => heartState(row, !vars.liked)),
      );
      return { previous, account, settledAt: undefined as number | undefined };
    },
    onError: (_error, vars, context) => {
      if (
        !userId ||
        !context?.account.isCurrent() ||
        latestHeart(client, kind, userId, identify(vars))?.state.context !== context
      )
        return;
      context.settledAt = Date.now();
      for (const [key, data] of context.previous) {
        const prior = data?.pages.flat().find((row) => heartRowId(kind, row) === identify(vars));
        if (prior)
          client.setQueryData<InfiniteData<HeartRow[]>>(key, (old) =>
            patchHeart(old, kind, identify(vars), (row) => ({
              ...row,
              my_like: prior.my_like,
              like_count: prior.like_count,
            })),
          );
      }
    },
    onSuccess: (result, vars, context) => {
      if (
        !result ||
        !userId ||
        !context?.account.isCurrent() ||
        latestHeart(client, kind, userId, identify(vars))?.state.context !== context
      )
        return;
      context.settledAt = Date.now();
      client.setQueriesData<InfiniteData<HeartRow[]>>(
        {
          predicate: (query) =>
            heartQueryOwnedBy(kind, query.queryKey, userId) &&
            (kind !== 'comment' || query.queryKey[1] === vars.postId),
        },
        (old) =>
          patchHeart(old, kind, identify(vars), (row) =>
            heartState(row, result.active, result.count),
          ),
      );
    },
    onSettled: (_result, _error, _vars, context) => {
      if (!context?.account.isCurrent()) return;
      scheduleQueryInvalidation(
        client,
        kind === 'comment' ? ['comments', 'commentLikes'] : ['pollVotersDetail'],
      );
    },
  });
}
