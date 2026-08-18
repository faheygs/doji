import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import type { Profile } from '../types/database';

const PAGE_SIZE = 30;

type VoterCursor = { createdAt: string; id: string } | null;

export type CommentLikeRow = {
  id: string;
  user_id: string;
  created_at: string;
  profile?: Pick<Profile, 'username' | 'display_name' | 'avatar_url' | 'equipped_border_key'> | null;
  friendship_status?: 'self' | 'friends' | 'pending_out' | 'pending_in' | 'none';
};

export function useCommentLikes(commentId: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['commentLikes', commentId],
    queryFn: async ({ pageParam }): Promise<CommentLikeRow[]> => {
      const { data, error } = await supabase.rpc('get_comment_like_voters_page', {
        p_comment_id: commentId,
        p_limit: PAGE_SIZE,
        p_before_created_at: pageParam?.createdAt ?? null,
        p_before_id: pageParam?.id ?? null,
      });
      if (error) throw error;
      return (data ?? []) as unknown as CommentLikeRow[];
    },
    getNextPageParam: (last): VoterCursor | undefined => {
      const tail = last.at(-1);
      return last.length === PAGE_SIZE && tail
        ? { createdAt: tail.created_at, id: tail.id }
        : undefined;
    },
    initialPageParam: null as VoterCursor,
    enabled: !!useAuthStore.getState().session?.user?.id && enabled && !!commentId,
    staleTime: 15_000,
  });
}
