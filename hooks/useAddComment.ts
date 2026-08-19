import { type InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query';
import { filterContent } from '../lib/contentFilter';
import {
  createOptimisticComment,
  prependOptimisticComment,
  replaceOptimisticComment,
} from '../lib/commentOptimism';
import { newCommandId } from '../lib/idempotency';
import { mapInfinitePosts } from '../lib/postCache';
import { refreshPostEngagement } from '../lib/postEngagement';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import type { Comment, Post } from '../types/database';

type AddCommentVars = {
  postId: string;
  body: string;
  parentId?: string | null;
  commandId?: string;
};

export function useAddComment() {
  const queryClient = useQueryClient();
  const session = useAuthStore((state) => state.session);
  const profile = useAuthStore((state) => state.profile);
  return useMutation({
    mutationFn: async (variables: AddCommentVars) => {
      const uid = session?.user?.id;
      if (!uid) throw new Error('Not authenticated');
      const body = variables.body.trim();
      if (!body) throw new Error('Comment cannot be empty');
      const check = filterContent(body);
      if (!check.ok) throw new Error(check.reason);
      variables.commandId ??= newCommandId('comment');
      const { data, error } = await supabase.rpc('submit_comment', {
        p_post_id: variables.postId,
        p_body: body,
        p_parent_id: variables.parentId ?? null,
        p_idempotency_key: variables.commandId,
      });
      if (error) throw error;
      return data as Comment;
    },
    onMutate: (variables) => {
      const uid = session?.user?.id;
      if (!uid) return undefined;
      variables.commandId ??= newCommandId('comment');
      const comments = queryClient.getQueriesData<InfiniteData<Comment[]>>({
        predicate: (query) =>
          query.queryKey[0] === 'comments' && query.queryKey[1] === variables.postId,
      });
      const feeds = queryClient.getQueriesData<InfiniteData<Post[]>>({
        predicate: (query) => query.queryKey[0] === 'feed',
      });
      const posts = queryClient.getQueriesData<Post | null>({
        predicate: (query) =>
          query.queryKey[0] === 'post' && query.queryKey[1] === variables.postId,
      });
      // Keep the actor path instant. Cancellation protects the optimistic row
      // from stale reads, but its promise must not gate rendering or the RPC.
      void queryClient.cancelQueries({
        predicate: (query) =>
          (query.queryKey[0] === 'comments' && query.queryKey[1] === variables.postId) ||
          query.queryKey[0] === 'feed' ||
          (query.queryKey[0] === 'post' && query.queryKey[1] === variables.postId),
      }, { revert: false, silent: true });
      const optimistic = createOptimisticComment({
        postId: variables.postId, userId: uid, body: variables.body.trim(),
        parentId: variables.parentId ?? null, commandId: variables.commandId, profile,
      });
      queryClient.setQueriesData<InfiniteData<Comment[]>>(
        { predicate: (query) => query.queryKey[0] === 'comments' && query.queryKey[1] === variables.postId },
        (old) => prependOptimisticComment(old, optimistic),
      );
      queryClient.setQueriesData<InfiniteData<Post[]>>(
        { predicate: (query) => query.queryKey[0] === 'feed' },
        (old) => mapInfinitePosts(old, variables.postId, (post) => ({ ...post, comment_count: post.comment_count + 1 })),
      );
      queryClient.setQueriesData<Post | null>(
        { predicate: (query) => query.queryKey[0] === 'post' && query.queryKey[1] === variables.postId },
        (old) => old ? { ...old, comment_count: old.comment_count + 1 } : old,
      );
      return { comments, feeds, posts, optimistic };
    },
    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.comments ?? []) queryClient.setQueryData(key, data);
      for (const [key, data] of context?.feeds ?? []) queryClient.setQueryData(key, data);
      for (const [key, data] of context?.posts ?? []) queryClient.setQueryData(key, data);
    },
    onSuccess: (result, variables, context) => {
      if (!variables.commandId) return;
      const authoritative: Comment = {
        ...result, like_count: result.like_count ?? 0,
        profile: context?.optimistic.profile, my_like: false,
      };
      queryClient.setQueriesData<InfiniteData<Comment[]>>(
        { predicate: (query) => query.queryKey[0] === 'comments' && query.queryKey[1] === variables.postId },
        (old) => replaceOptimisticComment(old, variables.commandId!, authoritative),
      );
      void refreshPostEngagement(queryClient, variables.postId);
      void queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'comments' && query.queryKey[1] === variables.postId,
        refetchType: 'active',
      }, { cancelRefetch: false });
    },
  });
}
