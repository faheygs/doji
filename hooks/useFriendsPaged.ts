import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';

const FRIEND_PAGE_SIZE = 50;
export type FriendListRow = {
  id: string;
  friendship_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_gradient: string[];
  current_streak: number;
  equipped_border_key: string | null;
  accepted_at: string;
};

export function useFriendsPaged() {
  const userId = useAuthStore((state) => state.session?.user?.id);
  return useInfiniteQuery({
    queryKey: ['friends', userId, 'paged'],
    queryFn: async ({ pageParam }): Promise<FriendListRow[]> => {
      if (!userId) return [];
      const { data, error } = await supabase.rpc('list_my_friends_page', {
        p_before_accepted_at: pageParam?.acceptedAt ?? null,
        p_before_id: pageParam?.id ?? null,
        p_limit: FRIEND_PAGE_SIZE,
      });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.friend_id,
        friendship_id: row.friendship_id,
        username: row.username,
        display_name: row.display_name,
        avatar_url: row.avatar_url,
        avatar_gradient: row.avatar_gradient,
        current_streak: row.current_streak,
        equipped_border_key: row.equipped_border_key,
        accepted_at: row.accepted_at,
      }));
    },
    initialPageParam: null as { acceptedAt: string; id: string } | null,
    getNextPageParam: (lastPage) => {
      const tail = lastPage.at(-1);
      return lastPage.length === FRIEND_PAGE_SIZE && tail?.accepted_at
        ? { acceptedAt: tail.accepted_at, id: tail.friendship_id }
        : undefined;
    },
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
}
