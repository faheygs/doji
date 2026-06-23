import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import { useDemoStore } from '../stores/useDemoStore';
import { DEMO_COMMENT_LIKES_BY_COMMENT } from '../constants/demoData';
import type { Profile } from '../types/database';

const PAGE_SIZE = 30;

export type CommentLikeRow = {
  id: string;
  user_id: string;
  created_at: string;
  profile?: Pick<Profile, 'username' | 'display_name' | 'avatar_url' | 'equipped_border_key'> | null;
};

export function useCommentLikes(commentId: string, enabled = true) {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);

  return useInfiniteQuery({
    queryKey: isDemoMode ? ['commentLikes', commentId, 'demo'] : ['commentLikes', commentId],
    queryFn: async ({ pageParam = 0 }): Promise<CommentLikeRow[]> => {
      if (isDemoMode) {
        const store = useDemoStore.getState();
        const staticLikers = (DEMO_COMMENT_LIKES_BY_COMMENT[commentId] ?? []) as CommentLikeRow[];
        const liked = store.demoLikedCommentIds.includes(commentId);
        if (!liked) return staticLikers;
        const p = useAuthStore.getState().profile;
        const uid = useAuthStore.getState().session?.user?.id ?? 'demo-me';
        const myLike: CommentLikeRow = {
          id: `demo-like-${commentId}`,
          user_id: uid,
          created_at: new Date().toISOString(),
          profile: p ? {
            username: p.username,
            display_name: p.display_name,
            avatar_url: p.avatar_url,
            equipped_border_key: p.equipped_border_key,
          } : null,
        };
        return [myLike, ...staticLikers];
      }

      const { data, error } = await supabase
        .from('comment_likes')
        .select('id, user_id, created_at, profile:profiles(username, display_name, avatar_url, equipped_border_key)')
        .eq('comment_id', commentId)
        .order('created_at', { ascending: false })
        .range(pageParam * PAGE_SIZE, (pageParam + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      return (data ?? []) as unknown as CommentLikeRow[];
    },
    getNextPageParam: (last, all) =>
      isDemoMode ? undefined : (last.length === PAGE_SIZE ? all.length : undefined),
    initialPageParam: 0,
    enabled: (isDemoMode || !!useAuthStore.getState().session?.user?.id) && enabled && !!commentId,
    staleTime: isDemoMode ? Infinity : 15_000,
  });
}
