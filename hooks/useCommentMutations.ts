import { type InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query';
import { filterContent } from '../lib/contentFilter';
import { patchInfiniteCommentLike } from '../lib/commentLikeOptimism';
import { newCommandId } from '../lib/idempotency';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';
import { useAuthStore } from '../stores/useAuthStore';
import type { Comment } from '../types/database';
import { refreshPostEngagement } from '../lib/postEngagement';
import type { FeedAudience } from '../lib/feedAudience';
import { executeCommand } from '../lib/commandGateway';

export function useEditComment() {
  const client = useQueryClient();
  const uid = useAuthStore((s) => s.session?.user?.id);
  return useMutation({
    mutationFn: async (vars: {
      postId: string;
      commentId: string;
      body: string;
      commandId?: string;
    }) => {
      if (!uid) throw new Error('Not authenticated');
      const body = vars.body.trim();
      if (!body) throw new Error('Comment cannot be empty');
      const check = filterContent(body);
      if (!check.ok) throw new Error(check.reason);
      vars.commandId ??= newCommandId('comment-edit');
      const { error } = await executeCommand('edit_comment', {
        p_comment_id: vars.commentId,
        p_body: body,
        p_idempotency_key: vars.commandId,
      });
      if (error) throw error;
    },
    onSettled: (_data, _error, vars) => {
      if (vars?.postId) scheduleQueryInvalidation(client, ['comments']);
    },
  });
}

export function useDeleteComment() {
  const client = useQueryClient();
  const uid = useAuthStore((s) => s.session?.user?.id);
  return useMutation({
    mutationFn: async (vars: {
      postId: string;
      commentId: string;
      feedAudience: FeedAudience;
      commandId?: string;
    }) => {
      if (!uid) throw new Error('Not authenticated');
      vars.commandId ??= newCommandId('comment-delete');
      const { error } = await executeCommand('delete_comment', {
        p_comment_id: vars.commentId,
        p_idempotency_key: vars.commandId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      void refreshPostEngagement(client, vars.postId, vars.feedAudience).catch((error) => {
        if (__DEV__) console.warn('[comments] delete reconciliation failed', error);
      });
      void client.invalidateQueries(
        {
          predicate: (query) =>
            query.queryKey[0] === 'comments' && query.queryKey[1] === vars.postId,
          refetchType: 'active',
        },
        { cancelRefetch: false },
      );
    },
  });
}

export function useToggleCommentLike() {
  const client = useQueryClient();
  const uid = useAuthStore((s) => s.session?.user?.id);
  return useMutation({
    mutationFn: async (vars: {
      postId: string;
      commentId: string;
      liked: boolean;
      commandId?: string;
    }) => {
      if (!uid) throw new Error('Not authenticated');
      vars.commandId ??= newCommandId('comment-like');
      const { data, error } = await executeCommand('toggle_comment_like', {
        p_comment_id: vars.commentId,
        p_idempotency_key: vars.commandId,
      });
      if (error) throw error;
      return data;
    },
    onMutate: (vars) => {
      const previous = client.getQueriesData<InfiniteData<Comment[]>>({
        predicate: (q) => q.queryKey[0] === 'comments' && q.queryKey[1] === vars.postId,
      });
      client.setQueriesData<InfiniteData<Comment[]>>(
        { predicate: (q) => q.queryKey[0] === 'comments' && q.queryKey[1] === vars.postId },
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
        { predicate: (q) => q.queryKey[0] === 'comments' && q.queryKey[1] === vars.postId },
        (old) => patchInfiniteCommentLike(old, vars.commentId, result.active, result.count),
      );
    },
  });
}

export function useToggleCommentsDisabled() {
  const client = useQueryClient();
  const uid = useAuthStore((s) => s.session?.user?.id);
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
    onSettled: (_data, _error, vars) => {
      if (vars?.postId) scheduleQueryInvalidation(client, ['feed', 'post']);
    },
  });
}
