import { useInfiniteQuery } from '@tanstack/react-query';
import { FALLBACK_AVATAR_GRADIENT } from '../constants/theme';
import { supabase } from '../lib/supabase';
import type { ProfileFriendListRow } from './useProfile';

const PAGE_SIZE = 50;

export function useProfileFriendsPaged(profileUserId?: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['profileFriends', profileUserId, 'paged'],
    queryFn: async ({ pageParam = 0 }): Promise<ProfileFriendListRow[]> => {
      if (!profileUserId) return [];
      const { data, error } = await supabase.rpc('list_profile_friends_page', {
        p_profile_user_id: profileUserId,
        p_limit: PAGE_SIZE,
        p_offset: pageParam,
      });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        friend_id: row.friend_id,
        username: row.username,
        display_name: row.display_name,
        avatar_url: row.avatar_url ?? null,
        equipped_border_key: row.equipped_border_key ?? null,
        avatar_gradient: Array.isArray(row.avatar_gradient) && row.avatar_gradient.length >= 2
          ? row.avatar_gradient
          : [...FALLBACK_AVATAR_GRADIENT],
      }));
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, offset) =>
      lastPage.length === PAGE_SIZE ? offset + PAGE_SIZE : undefined,
    enabled: Boolean(profileUserId && enabled),
    staleTime: 30_000,
  });
}
