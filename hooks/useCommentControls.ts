import { type InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query';
import { patchInfiniteCommentLike } from '../lib/commentLikeOptimism';
import { executeCommand } from '../lib/commandGateway';
import { newCommandId } from '../lib/idempotency';
import { mapInfinitePosts } from '../lib/postCache';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';
import { useAuthStore } from '../stores/useAuthStore';
import type { Comment, Post } from '../types/database';

export function useToggleCommentLike() {
  const client = useQueryClient();
  const uid = useAuthStore((state) => state.session?.user?.id);
  return useMutation({
    mutationFn: async (vars: {
      postId: string;
      commentId: string;
      liked: boolean;
      commandId?: string;
    }) => {
      if (!uid) throw new Error('Not authenticated');
      vars.commandId ??= newCommandId('comment-like');
      const { data, error } = await executeCommand('set_comment_like', {
        p_comment_id: vars.commentId,
        p_active: !vars.liked,
        p_idempotency_key: vars.commandId,
      });
      if (error) throw error;
      return data;
    },
    onMutate: (vars) => {
      const predicate = (query: { queryKey: readonly unknown[] }) =>
        query.queryKey[0] === 'comments' && query.queryKey[1] === vars.postId;
      const previous = client.getQueriesData<InfiniteData<Comment[]>>({ predicate });
      void client.cancelQueries({ predicate }, { revert: false, silent: true });
      client.setQueriesData<InfiniteData<Comment[]>>(
        { predicate },
        (old) => patchInfiniteCommentLike(old, vars.commentId, !vars.liked),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      for (const [key, data] of context?.previous ?? []) client.setQueryData(key, data);
    },
    onSuccess: (result, vars) => {
      if (!result) return;
      client.setQueriesData<InfiniteData<Comment[]>>(
        {
          predicate: (query) =>
            query.queryKey[0] === 'comments' && query.queryKey[1] === vars.postId,
        },
        (old) => patchInfiniteCommentLike(old, vars.commentId, result.active, result.count),
      );
    },
  });
}

export function useToggleCommentsDisabled() {
  const client = useQueryClient();
  const uid = useAuthStore((state) => state.session?.user?.id);
  return useMutation({
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
      client.setQueriesData<InfiniteData<Post[]>>(
        { predicate: feedPredicate },
        (old) => mapInfinitePosts(old, vars.postId, (post) => ({
          ...post,
          comments_disabled: vars.disabled,
        })),
      );
      client.setQueriesData<Post | null>(
        { predicate: postPredicate },
        (old) => old ? { ...old, comments_disabled: vars.disabled } : old,
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
