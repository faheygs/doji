import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { PUBLIC_PROFILE_COLUMNS } from '../lib/profileFields';
import { useAuthStore } from '../stores/useAuthStore';
import type { Profile } from '../types/database';

const FRIEND_PAGE_SIZE = 50;
export type FriendListRow = Profile & { friendship_id: string };

export function useFriendsPaged() {
  const userId = useAuthStore((state) => state.session?.user?.id);
  return useInfiniteQuery({
    queryKey: ['friends', userId, 'paged'],
    queryFn: async ({ pageParam = 0 }): Promise<FriendListRow[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('friendships')
        .select(`id, requester_id, addressee_id, requester:profiles!friendships_requester_id_fkey(${PUBLIC_PROFILE_COLUMNS}), addressee:profiles!friendships_addressee_id_fkey(${PUBLIC_PROFILE_COLUMNS})`)
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
        .eq('status', 'accepted')
        .order('accepted_at', { ascending: false })
        .range(pageParam, pageParam + FRIEND_PAGE_SIZE - 1);
      if (error) throw error;
      return (data ?? []).map((friendship: any) => ({
        ...(friendship.requester_id === userId ? friendship.addressee : friendship.requester),
        friendship_id: friendship.id,
      })) as FriendListRow[];
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, offset) =>
      lastPage.length === FRIEND_PAGE_SIZE ? offset + FRIEND_PAGE_SIZE : undefined,
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
}
