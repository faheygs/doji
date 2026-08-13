import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import type { Profile } from '../types/database';

const PAGE_SIZE = 30;

export type CommentLikeRow = {
  id: string;
  user_id: string;
  created_at: string;
  profile?: Pick<Profile, 'username' | 'display_name' | 'avatar_url' | 'equipped_border_key'> | null;
};

export function useCommentLikes(commentId: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['commentLikes', commentId],
    queryFn: async ({ pageParam = 0 }): Promise<CommentLikeRow[]> => {
      const { data, error } = await supabase
        .from('comment_likes')
        .select('id, user_id, created_at, profile:profiles(username, display_name, avatar_url, equipped_border_key)')
        .eq('comment_id', commentId)
        .order('created_at', { ascending: false })
        .range(pageParam * PAGE_SIZE, (pageParam + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      return (data ?? []) as unknown as CommentLikeRow[];
    },
    getNextPageParam: (last, all) => last.length === PAGE_SIZE ? all.length : undefined,
    initialPageParam: 0,
    enabled: !!useAuthStore.getState().session?.user?.id && enabled && !!commentId,
    staleTime: 15_000,
  });
}
