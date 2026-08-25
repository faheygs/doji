import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';
import { useAuthStore } from '../stores/useAuthStore';
import type { Post } from '../types/database';
import { newCommandId } from '../lib/idempotency';
import { executeCommand } from '../lib/commandGateway';
import { runAbortableQuery } from '../lib/requestSignal';

type BlockInput = {
  blockedUserId: string;
  friendshipId?: string;
  commandId?: string;
};

const BLOCKED_USER_PAGE_SIZE = 50;
export type BlockedUser = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  equipped_border_key: string | null;
  block_id: string;
  blocked_at: string;
};

export function useBlockUser() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user?.id);

  return useMutation({
    mutationFn: async (variables: BlockInput) => {
      const { blockedUserId } = variables;
      if (!userId) throw new Error('Not authenticated');
      variables.commandId ??= newCommandId('block-user');
      const { error } = await executeCommand('block_user', {
        p_blocked_user_id: blockedUserId,
        p_idempotency_key: variables.commandId,
      });
      if (error) throw error;
    },
    onMutate: ({ blockedUserId }) => {
      const previousFeeds = queryClient.getQueriesData<InfiniteData<Post[]>>({
        predicate: (query) => query.queryKey[0] === 'feed',
      });
      void queryClient.cancelQueries(
        { predicate: (query) => query.queryKey[0] === 'feed' },
        { revert: false, silent: true },
      );
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
      const { error } = await executeCommand('unblock_user', {
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

export function useBlockedUsersPaged() {
  const userId = useAuthStore((s) => s.session?.user?.id);
  return useInfiniteQuery({
    queryKey: ['blockedUsers', userId, 'paged'],
    queryFn: async ({ pageParam, signal }): Promise<BlockedUser[]> => {
      if (!userId) return [];
      const { data, error } = await runAbortableQuery(supabase.rpc('list_blocked_users_page', {
        p_before_created_at: pageParam?.createdAt ?? null,
        p_before_id: pageParam?.id ?? null,
        p_limit: BLOCKED_USER_PAGE_SIZE,
      }), signal);
      if (error) throw error;
      return data ?? [];
    },
    initialPageParam: null as { createdAt: string; id: string } | null,
    getNextPageParam: (lastPage) => {
      const tail = lastPage.at(-1);
      return lastPage.length === BLOCKED_USER_PAGE_SIZE && tail
        ? { createdAt: tail.blocked_at, id: tail.block_id }
        : undefined;
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}

export function useBlockedUserCount() {
  const userId = useAuthStore((s) => s.session?.user?.id);
  return useQuery({
    queryKey: ['blockedUsers', userId, 'count'],
    queryFn: async ({ signal }): Promise<number> => {
      if (!userId) return 0;
      const { data, error } = await runAbortableQuery(supabase.rpc('blocked_user_count'), signal);
      if (error) throw error;
      return data ?? 0;
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}

export function useIsBlockedByMe(targetUserId?: string) {
  const userId = useAuthStore((s) => s.session?.user?.id);
  return useQuery<boolean>({
    queryKey: ['isBlocked', userId, targetUserId],
    queryFn: async ({ signal }): Promise<boolean> => {
      if (!userId || !targetUserId) return false;
      const { count, error } = await runAbortableQuery(supabase
        .from('blocks')
        .select('id', { count: 'exact', head: true })
        .eq('blocker_id', userId)
        .eq('blocked_id', targetUserId), signal);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    enabled: !!userId && !!targetUserId,
    staleTime: 30_000,
  });
}
