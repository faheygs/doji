import { type InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query';
import { ContentValidationError, filterContent } from '../lib/contentFilter';
import {
  createOptimisticComment,
  prependOptimisticComment,
  replaceOptimisticComment,
} from '../lib/commentOptimism';
import { newCommandId } from '../lib/idempotency';
import { mapInfinitePosts } from '../lib/postCache';
import { refreshPostEngagement } from '../lib/postEngagement';
import { captureProfileAccount, useAuthStore } from '../stores/useAuthStore';
import { settleCommentWindow } from '../lib/commentWindowCache';
import type { Comment, Post } from '../types/database';
import type { FeedAudience } from '../lib/feedAudience';
import { executeCommand } from '../lib/commandGateway';

export type AddCommentVars = {
  postId: string;
  body: string;
  parentId?: string | null;
  replyToCommentId?: string | null;
  commandId?: string;
  feedAudience: FeedAudience;
  account?: ReturnType<typeof captureProfileAccount>;
};

export function useAddComment() {
  const queryClient = useQueryClient();
  const session = useAuthStore((state) => state.session);
  const profile = useAuthStore((state) => state.profile);
  const uid = session?.user?.id;
  const isCurrentMember = () => !!uid && useAuthStore.getState().session?.user.id === uid;
  return useMutation({
    // Keep pending callbacks attached to the account that started the command.
    mutationKey: ['addComment', uid],
    mutationFn: async (variables: AddCommentVars) => {
      if (!isCurrentMember() || (variables.account && !variables.account.isCurrent())) throw new Error('Not authenticated');
      const body = variables.body.trim();
      if (!body) throw new ContentValidationError('empty_comment');
      const check = filterContent(body);
      if (!check.ok) throw new ContentValidationError('prohibited_language');
      variables.commandId ??= newCommandId('comment');
      const payload = {
        p_post_id: variables.postId,
        p_body: body,
        p_parent_id: variables.replyToCommentId ?? variables.parentId ?? null,
        p_idempotency_key: variables.commandId,
      };
      const { data, error } = variables.account
        ? await executeCommand('submit_comment', payload, { expectedUserId: uid!, isCurrent: variables.account.isCurrent })
        : await executeCommand('submit_comment', payload);
      if (error) throw error;
      return data as Comment;
    },
    onMutate: (variables) => {
      if (!uid || !isCurrentMember() || (variables.account && !variables.account.isCurrent())) return undefined;
      const body = variables.body.trim();
      if (!body || !filterContent(body).ok) return undefined;
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
      void queryClient.cancelQueries(
        {
          predicate: (query) =>
            (query.queryKey[0] === 'comments' && query.queryKey[1] === variables.postId) ||
            query.queryKey[0] === 'feed' ||
            (query.queryKey[0] === 'post' && query.queryKey[1] === variables.postId),
        },
        { revert: false, silent: true },
      );
      const optimistic = createOptimisticComment({
        postId: variables.postId,
        userId: uid,
        body,
        parentId: variables.parentId ?? null,
        replyToCommentId: variables.replyToCommentId ?? null,
        commandId: variables.commandId,
        profile: profile?.id === uid ? profile : undefined,
      });
      queryClient.setQueriesData<InfiniteData<Comment[]>>(
        {
          predicate: (query) =>
            query.queryKey[0] === 'comments' && query.queryKey[1] === variables.postId,
        },
        (old) => prependOptimisticComment(old, optimistic),
      );
      queryClient.setQueriesData<InfiniteData<Post[]>>(
        { predicate: (query) => query.queryKey[0] === 'feed' },
        (old) =>
          mapInfinitePosts(old, variables.postId, (post) => ({
            ...post,
            comment_count: post.comment_count + 1,
          })),
      );
      queryClient.setQueriesData<Post | null>(
        {
          predicate: (query) =>
            query.queryKey[0] === 'post' && query.queryKey[1] === variables.postId,
        },
        (old) => (old ? { ...old, comment_count: old.comment_count + 1 } : old),
      );
      return { comments, feeds, posts, optimistic, account: captureProfileAccount() };
    },
    onError: (_error, _variables, context) => {
      if (!isCurrentMember() || !context?.account.isCurrent()) return;
      for (const [key] of context.comments) queryClient.setQueryData<InfiniteData<Comment[]>>(key, old => old ? ({
        ...old, pages: old.pages.map(page => page.filter(row => row.id !== context.optimistic.id)),
      }) : old);
      // Undo only the increment this attempt installed, not newer hearts/reads.
      for (const [key, before] of context.feeds) queryClient.setQueryData<InfiniteData<Post[]>>(key, old =>
        mapInfinitePosts(old, _variables.postId, post => {
          const prior = before?.pages.flat().find(row => row.id === post.id);
          return prior && post.comment_count === prior.comment_count + 1 ? { ...post, comment_count: prior.comment_count } : post;
        }));
      for (const [key, before] of context.posts) queryClient.setQueryData<Post | null>(key, old =>
        old && before && old.comment_count === before.comment_count + 1 ? { ...old, comment_count: before.comment_count } : old);
    },
    onSuccess: (result, variables, context) => {
      if (!isCurrentMember() || !context?.account.isCurrent()) return;
      if (context?.account.isCurrent()) settleCommentWindow(queryClient, uid!, variables.postId, { kind: 'add', parentId: variables.parentId ?? null });
      if (!variables.commandId) return;
      const authoritative: Comment = {
        ...result,
        like_count: result.like_count ?? 0,
        profile: context?.optimistic.profile,
        my_like: false,
      };
      queryClient.setQueriesData<InfiniteData<Comment[]>>(
        {
          predicate: (query) =>
            query.queryKey[0] === 'comments' && query.queryKey[1] === variables.postId,
        },
        (old) => replaceOptimisticComment(old, variables.commandId!, authoritative),
      );
      void refreshPostEngagement(queryClient, variables.postId, variables.feedAudience).catch(
        (error) => {
          if (__DEV__) console.warn('[comments] engagement refresh failed', error);
        },
      );
      void queryClient.invalidateQueries(
        {
          predicate: (query) =>
            query.queryKey[0] === 'comments' && query.queryKey[1] === variables.postId,
          refetchType: 'active',
        },
        { cancelRefetch: false },
      );
    },
  });
}
