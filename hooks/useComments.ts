import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import type { FeedAudience } from '../lib/feedAudience';
import type { Comment, Profile } from '../types/database';
import { filterContent } from '../lib/contentFilter';
import { newCommandId } from '../lib/idempotency';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';
import { createRequestSignal } from '../lib/requestSignal';
import { patchInfiniteCommentLike } from '../lib/commentLikeOptimism';

export type CommentWithMeta = Comment;

async function fetchCommentsForPost(
  postId: string,
  audience: FeedAudience,
  page: { beforeCreatedAt: string; beforeId: string } | null,
  parentSignal?: AbortSignal,
): Promise<CommentWithMeta[]> {
  const request = createRequestSignal(parentSignal);
  try {
    const { data, error } = await supabase
      .rpc('get_comment_thread_snapshot', {
        p_post_id: postId,
        p_audience: audience,
        p_before_created_at: page?.beforeCreatedAt ?? null,
        p_before_id: page?.beforeId ?? null,
        p_limit: 50,
      })
      .abortSignal(request.signal);
    if (error) throw error;
    return (data ?? []) as CommentWithMeta[];
  } finally {
    request.cleanup();
  }
}

export function useComments(
  postId: string | undefined,
  options?: { fetchEnabled?: boolean; feedAudience?: FeedAudience },
) {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id;
  const fetchEnabled = options?.fetchEnabled !== false;
  const feedAudience = options?.feedAudience ?? 'everyone';

  return useInfiniteQuery({
    queryKey: ['comments', postId, userId, feedAudience],
    queryFn: ({ signal, pageParam }) =>
      fetchCommentsForPost(postId!, feedAudience, pageParam, signal),
    initialPageParam: null as { beforeCreatedAt: string; beforeId: string } | null,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < 50) return undefined;
      const last = lastPage[lastPage.length - 1];
      return { beforeCreatedAt: last.created_at, beforeId: last.id };
    },
    enabled: !!postId && !!userId && fetchEnabled,
    staleTime: 20_000,
  });
}

export function useMentionSearch(query: string, options?: { enabled?: boolean }) {
  const session = useAuthStore((s) => s.session);
  const viewerId = session?.user?.id;
  const enabled = options?.enabled !== false && !!viewerId;

  return useQuery({
    queryKey: ['mentionSearch', viewerId, query],
    queryFn: async (): Promise<Profile[]> => {
      if (!viewerId) return [];
      const trimmed = query.trim();
      const { data, error } = await supabase.rpc('search_mentionable_profiles', {
        p_query: trimmed,
        p_limit: 8,
      });
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
    enabled,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

type AddCommentVars = {
  postId: string;
  body: string;
  parentId?: string | null;
  commandId?: string;
};

export function useAddComment() {
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);

  return useMutation({
    mutationFn: async (variables: AddCommentVars) => {
      const { postId, body, parentId } = variables;
      const uid = session?.user?.id;
      if (!uid) throw new Error('Not authenticated');
      const trimmed = body.trim();
      if (!trimmed) throw new Error('Comment cannot be empty');
      const check = filterContent(trimmed);
      if (!check.ok) throw new Error(check.reason);
      variables.commandId ??= newCommandId('comment');
      const { error } = await supabase.rpc('submit_comment', {
        p_post_id: postId,
        p_body: trimmed,
        p_parent_id: parentId ?? null,
        p_idempotency_key: variables.commandId,
      });

      if (error) throw error;
    },
    onSettled: (_data, _err, vars) => {
      if (!vars?.postId) return;
      scheduleQueryInvalidation(queryClient, ['comments', 'feed', 'post']);
    },
  });
}

type EditCommentVars = {
  postId: string;
  commentId: string;
  body: string;
  commandId?: string;
};

export function useEditComment() {
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);

  return useMutation({
    mutationFn: async (variables: EditCommentVars) => {
      const { commentId, body } = variables;
      const uid = session?.user?.id;
      if (!uid) throw new Error('Not authenticated');
      const trimmed = body.trim();
      if (!trimmed) throw new Error('Comment cannot be empty');
      const check = filterContent(trimmed);
      if (!check.ok) throw new Error(check.reason);
      variables.commandId ??= newCommandId('comment-edit');
      const { error } = await supabase.rpc('edit_comment', {
        p_comment_id: commentId,
        p_body: trimmed,
        p_idempotency_key: variables.commandId,
      });
      if (error) throw error;
    },
    onSettled: (_data, _err, vars) => {
      if (!vars?.postId) return;
      scheduleQueryInvalidation(queryClient, ['comments']);
    },
  });
}

type DeleteCommentVars = {
  postId: string;
  commentId: string;
  commandId?: string;
};

export function useDeleteComment() {
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);

  return useMutation({
    mutationFn: async (variables: DeleteCommentVars) => {
      const { commentId } = variables;
      const uid = session?.user?.id;
      if (!uid) throw new Error('Not authenticated');
      variables.commandId ??= newCommandId('comment-delete');
      const { error } = await supabase.rpc('delete_comment', {
        p_comment_id: commentId,
        p_idempotency_key: variables.commandId,
      });
      if (error) throw error;
    },
    onSettled: (_data, _err, vars) => {
      if (!vars?.postId) return;
      scheduleQueryInvalidation(queryClient, ['comments', 'feed', 'post']);
    },
  });
}

type ToggleCommentLikeVars = {
  postId: string;
  commentId: string;
  liked: boolean;
  commandId?: string;
};

export function useToggleCommentLike() {
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);

  return useMutation({
    mutationFn: async (variables: ToggleCommentLikeVars) => {
      const { commentId } = variables;
      const uid = session?.user?.id;
      if (!uid) throw new Error('Not authenticated');
      variables.commandId ??= newCommandId('comment-like');
      const { data, error } = await supabase.rpc('toggle_comment_like', {
        p_comment_id: commentId,
        p_idempotency_key: variables.commandId,
      });
      if (error) throw error;
      return data;
    },
    onMutate: (vars) => {
      const previousCommentQueries = queryClient.getQueriesData<InfiniteData<CommentWithMeta[]>>({
        predicate: (query) => query.queryKey[0] === 'comments' && query.queryKey[1] === vars.postId,
      });
      queryClient.setQueriesData<InfiniteData<CommentWithMeta[]>>(
        {
          predicate: (query) =>
            query.queryKey[0] === 'comments' && query.queryKey[1] === vars.postId,
        },
        (old) => patchInfiniteCommentLike(old, vars.commentId, !vars.liked),
      );
      return { previousCommentQueries };
    },
    onError: (_error, _vars, context) => {
      for (const [queryKey, data] of context?.previousCommentQueries ?? []) {
        queryClient.setQueryData(queryKey, data);
      }
    },
    onSuccess: (result, vars) => {
      if (!result) return;
      queryClient.setQueriesData<InfiniteData<CommentWithMeta[]>>(
        {
          predicate: (query) =>
            query.queryKey[0] === 'comments' && query.queryKey[1] === vars.postId,
        },
        (old) => patchInfiniteCommentLike(old, vars.commentId, result.active, result.count),
      );
    },
  });
}

type ToggleCommentsDisabledVars = {
  postId: string;
  disabled: boolean;
  commandId?: string;
};

export function useToggleCommentsDisabled() {
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);

  return useMutation({
    mutationFn: async (variables: ToggleCommentsDisabledVars) => {
      const { postId, disabled } = variables;
      const uid = session?.user?.id;
      if (!uid) throw new Error('Not authenticated');
      variables.commandId ??= newCommandId('post-comments');
      const { error } = await supabase.rpc('set_post_comments_disabled', {
        p_post_id: postId,
        p_disabled: disabled,
        p_idempotency_key: variables.commandId,
      });
      if (error) throw error;
    },
    onSettled: (_data, _err, vars) => {
      if (vars?.postId) {
        scheduleQueryInvalidation(queryClient, ['feed', 'post']);
      }
    },
  });
}
