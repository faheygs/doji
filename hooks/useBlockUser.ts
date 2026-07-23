import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import { useDemoStore } from '../stores/useDemoStore';
import { DEMO_USERS } from '../constants/demoData';
import type { Profile } from '../types/database';

type BlockInput = {
  blockedUserId: string;
  friendshipId?: string;
};

export type BlockedUser = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;

const ALL_DEMO_USERS = Object.values(DEMO_USERS);

export function useBlockUser() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user?.id);

  return useMutation({
    mutationFn: async ({ blockedUserId, friendshipId }: BlockInput) => {
      if (useDemoStore.getState().isDemoMode) {
        useDemoStore.getState().blockDemoUser(blockedUserId);
        return;
      }
      if (!userId) throw new Error('Not authenticated');

      const [blockResult] = await Promise.all([
        supabase.from('blocks').insert({ blocker_id: userId, blocked_id: blockedUserId }),
        friendshipId
          ? supabase.from('friendships').delete().eq('id', friendshipId)
          : Promise.resolve({ error: null }),
      ]);

      if (blockResult.error) throw blockResult.error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['friendship'] });
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
      queryClient.invalidateQueries({ queryKey: ['notificationCenter'] });
      queryClient.invalidateQueries({ queryKey: ['blockedUsers'] });
      queryClient.invalidateQueries({ queryKey: ['isBlocked'] });
    },
  });
}

export function useUnblockUser() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user?.id);

  return useMutation({
    mutationFn: async (blockedUserId: string) => {
      if (useDemoStore.getState().isDemoMode) {
        useDemoStore.getState().unblockDemoUser(blockedUserId);
        return;
      }
      if (!userId) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('blocks')
        .delete()
        .eq('blocker_id', userId)
        .eq('blocked_id', blockedUserId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blockedUsers'] });
      queryClient.invalidateQueries({ queryKey: ['isBlocked'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useBlockedUsers() {
  const userId = useAuthStore((s) => s.session?.user?.id);
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  const demoBlockedIds = useDemoStore((s) => s.demoBlockedIds);

  return useQuery<BlockedUser[]>({
    queryKey: isDemoMode ? ['blockedUsers', 'demo', demoBlockedIds] : ['blockedUsers', userId],
    queryFn: async (): Promise<BlockedUser[]> => {
      if (isDemoMode) {
        return demoBlockedIds
          .map((id) => ALL_DEMO_USERS.find((u) => u.id === id))
          .filter((u): u is Profile => Boolean(u))
          .map(({ id, username, display_name, avatar_url }) => ({
            id,
            username,
            display_name,
            avatar_url,
          }));
      }
      if (!userId) return [];
      const { data, error } = await supabase
        .from('blocks')
        .select('blocked_id, profile:profiles!blocks_blocked_fkey(id, username, display_name, avatar_url)')
        .eq('blocker_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => row.profile as unknown as BlockedUser).filter(Boolean);
    },
    enabled: isDemoMode || !!userId,
    staleTime: isDemoMode ? Infinity : 30_000,
  });
}

export function useIsBlockedByMe(targetUserId?: string) {
  const userId = useAuthStore((s) => s.session?.user?.id);
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  const demoBlockedIds = useDemoStore((s) => s.demoBlockedIds);

  return useQuery<boolean>({
    queryKey: isDemoMode
      ? ['isBlocked', 'demo', targetUserId, demoBlockedIds]
      : ['isBlocked', userId, targetUserId],
    queryFn: async (): Promise<boolean> => {
      if (isDemoMode) {
        return !!targetUserId && demoBlockedIds.includes(targetUserId);
      }
      if (!userId || !targetUserId) return false;
      const { count, error } = await supabase
        .from('blocks')
        .select('id', { count: 'exact', head: true })
        .eq('blocker_id', userId)
        .eq('blocked_id', targetUserId);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    enabled: isDemoMode ? !!targetUserId : (!!userId && !!targetUserId),
    staleTime: isDemoMode ? Infinity : 30_000,
  });
}
