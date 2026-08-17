import { useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';
import { useAuthStore } from '../stores/useAuthStore';
import type { Post, Profile } from '../types/database';
import { newCommandId } from '../lib/idempotency';

type BlockInput = {
  blockedUserId: string;
  friendshipId?: string;
  commandId?: string;
};

export type BlockedUser = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url' | 'equipped_border_key'>;

export function useBlockUser() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user?.id);

  return useMutation({
    mutationFn: async (variables: BlockInput) => {
      const { blockedUserId } = variables;
      if (!userId) throw new Error('Not authenticated');
      variables.commandId ??= newCommandId('block-user');
      const { error } = await supabase.rpc('block_user', {
        p_blocked_user_id: blockedUserId,
        p_idempotency_key: variables.commandId,
      });
      if (error) throw error;
    },
    onMutate: async ({ blockedUserId }) => {
      await queryClient.cancelQueries({ predicate: (query) => query.queryKey[0] === 'feed' });
      const previousFeeds = queryClient.getQueriesData<InfiniteData<Post[]>>({
        predicate: (query) => query.queryKey[0] === 'feed',
      });
      queryClient.setQueriesData<InfiniteData<Post[]>>(
        { predicate: (query) => query.queryKey[0] === 'feed' },
        (old) => old
          ? { ...old, pages: old.pages.map((page) => page.filter((post) => post.user_id !== blockedUserId)) }
          : old,
      );
      return { previousFeeds };
    },
    onError: (_error, _variables, context) => {
      for (const [queryKey, data] of context?.previousFeeds ?? []) {
        queryClient.setQueryData(queryKey, data);
      }
    },
    onSuccess: () => {
      scheduleQueryInvalidation(queryClient, [
        'feed',
        'friendship',
        'friends',
        'friendRequests',
        'notificationCenter',
        'blockedUsers',
        'isBlocked',
        'profile',
        'leaderboard',
      ]);
    },
  });
}

export function useUnblockUser() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user?.id);

  return useMutation({
    mutationFn: async (variables: { blockedUserId: string; commandId?: string }) => {
      const { blockedUserId } = variables;
      if (!userId) throw new Error('Not authenticated');
      variables.commandId ??= newCommandId('unblock-user');
      const { error } = await supabase.rpc('unblock_user', {
        p_blocked_user_id: blockedUserId,
        p_idempotency_key: variables.commandId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      scheduleQueryInvalidation(queryClient, [
        'blockedUsers', 'isBlocked', 'profile', 'leaderboard', 'feed',
      ]);
    },
  });
}

export function useBlockedUsers() {
  const userId = useAuthStore((s) => s.session?.user?.id);
  return useQuery<BlockedUser[]>({
    queryKey: ['blockedUsers', userId],
    queryFn: async (): Promise<BlockedUser[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('blocks')
        .select('blocked_id, profile:profiles!blocks_blocked_fkey(id, username, display_name, avatar_url, equipped_border_key)')
        .eq('blocker_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => row.profile as unknown as BlockedUser).filter(Boolean);
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}

export function useIsBlockedByMe(targetUserId?: string) {
  const userId = useAuthStore((s) => s.session?.user?.id);
  return useQuery<boolean>({
    queryKey: ['isBlocked', userId, targetUserId],
    queryFn: async (): Promise<boolean> => {
      if (!userId || !targetUserId) return false;
      const { count, error } = await supabase
        .from('blocks')
        .select('id', { count: 'exact', head: true })
        .eq('blocker_id', userId)
        .eq('blocked_id', targetUserId);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    enabled: !!userId && !!targetUserId,
    staleTime: 30_000,
  });
}
