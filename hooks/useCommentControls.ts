import { type InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query';
import { useHeartMutation } from './useHeartMutation';
import { executeCommand } from '../lib/commandGateway';
import { newCommandId } from '../lib/idempotency';
import { mapInfinitePosts } from '../lib/postCache';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';
import { useAuthStore } from '../stores/useAuthStore';
import type { Post } from '../types/database';

export function useToggleCommentLike() {
  return useHeartMutation('comment', (vars: {
      postId: string;
      commentId: string;
      liked: boolean;
      commandId?: string;
    }) => vars.commentId);
}

export function useToggleCommentsDisabled() {
  const client = useQueryClient();
  const uid = useAuthStore((state) => state.session?.user?.id);
  return useMutation({
    mutationKey: ['toggleCommentsDisabled'],
    mutationFn: async (vars: { postId: string; disabled: boolean; commandId?: string }) => {
      if (!uid) throw new Error('Not authenticated');
      vars.commandId ??= newCommandId('post-comments');
      const { error } = await executeCommand('set_post_comments_disabled', {
        p_post_id: vars.postId,
        p_disabled: vars.disabled,
        p_idempotency_key: vars.commandId,
      });
      if (error) throw error;
    },
    onMutate: (vars) => {
      const feedPredicate = (query: { queryKey: readonly unknown[] }) =>
        query.queryKey[0] === 'feed';
      const postPredicate = (query: { queryKey: readonly unknown[] }) =>
        query.queryKey[0] === 'post' && query.queryKey[1] === vars.postId;
      const feeds = client.getQueriesData<InfiniteData<Post[]>>({ predicate: feedPredicate });
      const posts = client.getQueriesData<Post | null>({ predicate: postPredicate });
      void client.cancelQueries(
        { predicate: (query) => feedPredicate(query) || postPredicate(query) },
        { revert: false, silent: true },
      );
      client.setQueriesData<InfiniteData<Post[]>>({ predicate: feedPredicate }, (old) =>
        mapInfinitePosts(old, vars.postId, (post) => ({
          ...post,
          comments_disabled: vars.disabled,
        })),
      );
      client.setQueriesData<Post | null>({ predicate: postPredicate }, (old) =>
        old ? { ...old, comments_disabled: vars.disabled } : old,
      );
      return { feeds, posts };
    },
    onError: (_error, _vars, context) => {
      for (const [key, data] of context?.feeds ?? []) client.setQueryData(key, data);
      for (const [key, data] of context?.posts ?? []) client.setQueryData(key, data);
    },
    onSuccess: () => scheduleQueryInvalidation(client, ['feed', 'post']),
  });
}
