import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import type { FeedAudience } from '../lib/feedAudience';
import type { Comment, Profile } from '../types/database';
import { createRequestSignal } from '../lib/requestSignal';
export { useAddComment } from './useAddComment';
export {
  useDeleteComment,
  useEditComment,
  useToggleCommentLike,
  useToggleCommentsDisabled,
} from './useCommentMutations';

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
