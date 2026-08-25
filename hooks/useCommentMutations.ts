import { type InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query';
import { filterContent } from '../lib/contentFilter';
import { newCommandId } from '../lib/idempotency';
import { useAuthStore } from '../stores/useAuthStore';
import type { Comment, Post } from '../types/database';
import { mapInfinitePosts } from '../lib/postCache';
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
    onMutate: (vars) => {
      const previous = client.getQueriesData<InfiniteData<Comment[]>>({
        predicate: (query) => query.queryKey[0] === 'comments' && query.queryKey[1] === vars.postId,
      });
      void client.cancelQueries(
        {
          predicate: (query) =>
            query.queryKey[0] === 'comments' && query.queryKey[1] === vars.postId,
        },
        { revert: false, silent: true },
      );
      client.setQueriesData<InfiniteData<Comment[]>>(
        { predicate: (query) => query.queryKey[0] === 'comments' && query.queryKey[1] === vars.postId },
        (old) => old
          ? {
              ...old,
              pages: old.pages.map((page) => page.map((comment) =>
                comment.id === vars.commentId ? { ...comment, body: vars.body.trim() } : comment
              )),
            }
          : old,
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      for (const [key, data] of context?.previous ?? []) client.setQueryData(key, data);
    },
    onSuccess: (_data, vars) => {
      void client.invalidateQueries(
        {
          predicate: (query) => query.queryKey[0] === 'comments' && query.queryKey[1] === vars.postId,
          refetchType: 'active',
        },
        { cancelRefetch: false },
      );
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
    onMutate: (vars) => {
      const comments = client.getQueriesData<InfiniteData<Comment[]>>({
        predicate: (query) => query.queryKey[0] === 'comments' && query.queryKey[1] === vars.postId,
      });
      const feeds = client.getQueriesData<InfiniteData<Post[]>>({
        predicate: (query) => query.queryKey[0] === 'feed',
      });
      const posts = client.getQueriesData<Post | null>({
        predicate: (query) => query.queryKey[0] === 'post' && query.queryKey[1] === vars.postId,
      });
      void client.cancelQueries(
        {
          predicate: (query) =>
            (query.queryKey[0] === 'comments' && query.queryKey[1] === vars.postId) ||
            query.queryKey[0] === 'feed' ||
            (query.queryKey[0] === 'post' && query.queryKey[1] === vars.postId),
        },
        { revert: false, silent: true },
      );
      client.setQueriesData<InfiniteData<Comment[]>>(
        { predicate: (query) => query.queryKey[0] === 'comments' && query.queryKey[1] === vars.postId },
        (old) => old
          ? {
              ...old,
              pages: old.pages.map((page) => page.filter((comment) => comment.id !== vars.commentId)),
            }
          : old,
      );
      client.setQueriesData<InfiniteData<Post[]>>(
        { predicate: (query) => query.queryKey[0] === 'feed' },
        (old) => mapInfinitePosts(old, vars.postId, (post) => ({
          ...post,
          comment_count: Math.max(0, post.comment_count - 1),
        })),
      );
      client.setQueriesData<Post | null>(
        { predicate: (query) => query.queryKey[0] === 'post' && query.queryKey[1] === vars.postId },
        (old) => old ? { ...old, comment_count: Math.max(0, old.comment_count - 1) } : old,
      );
      return { comments, feeds, posts };
    },
    onError: (_error, _vars, context) => {
      for (const [key, data] of context?.comments ?? []) client.setQueryData(key, data);
      for (const [key, data] of context?.feeds ?? []) client.setQueryData(key, data);
      for (const [key, data] of context?.posts ?? []) client.setQueryData(key, data);
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
