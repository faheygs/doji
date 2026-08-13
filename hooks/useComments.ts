import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import { fetchMentionableUserIds } from '../lib/mentionNetwork';
import type { FeedAudience } from '../lib/feedAudience';
import type { Comment, Profile } from '../types/database';
import { filterContent } from '../lib/contentFilter';
import { newCommandId } from '../lib/idempotency';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';
import { createRequestSignal } from '../lib/requestSignal';

export type CommentWithMeta = Comment;

async function fetchCommentsForPost(
  postId: string,
  audience: FeedAudience,
  parentSignal?: AbortSignal,
): Promise<CommentWithMeta[]> {
  const request = createRequestSignal(parentSignal);
  try {
    const { data, error } = await supabase
      .rpc('get_comment_thread_snapshot', { p_post_id: postId, p_audience: audience })
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

  return useQuery({
    queryKey: ['comments', postId, userId, feedAudience],
    queryFn: ({ signal }) => fetchCommentsForPost(postId!, feedAudience, signal),
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
      const mentionableIds = await fetchMentionableUserIds(viewerId);
      if (mentionableIds.length === 0) return [];

      const trimmed = query.trim();
      let builder = supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', mentionableIds)
        .limit(8);

      if (trimmed) {
        builder = builder.ilike('username', `${trimmed}%`);
      } else {
        builder = builder.order('username', { ascending: true });
      }

      const { data, error } = await builder;
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
    onSuccess: (result, vars) => {
      if (!result) return;
      queryClient.setQueriesData<CommentWithMeta[]>(
        {
          predicate: (query) =>
            query.queryKey[0] === 'comments' && query.queryKey[1] === vars.postId,
        },
        (old) =>
          (old ?? []).map((comment) =>
            comment.id === vars.commentId
              ? { ...comment, my_like: result.active, like_count: result.count }
              : comment,
          ),
      );
    },
    onSettled: (_data, _err, vars) => {
      if (!vars?.postId) return;
      scheduleQueryInvalidation(queryClient, ['comments']);
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
