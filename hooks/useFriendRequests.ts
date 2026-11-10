import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { newCommandId } from '../lib/idempotency';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';
import { captureProfileAccount, useAuthStore } from '../stores/useAuthStore';
import type { Friendship, FriendshipWithRequester, Profile } from '../types/database';
import { invalidateFriendCountQueries } from './useProfile';
import { patchCachedFriendshipStatus } from '../lib/friendshipCache';
import { executeCommand } from '../lib/commandGateway';
import { runAbortableQuery } from '../lib/requestSignal';

const PAGE_SIZE = 50;

export function useFriendRequests(enabled = true) {
  const userId = useAuthStore((state) => state.session?.user?.id);
  return useInfiniteQuery({
    queryKey: ['friendRequests', userId, 'paged'],
    queryFn: async ({ pageParam, signal }): Promise<FriendshipWithRequester[]> => {
      if (!userId) return [];
      const { data, error } = await runAbortableQuery(supabase.rpc('list_friend_requests_page', {
        p_before_created_at: pageParam?.createdAt ?? null,
        p_before_id: pageParam?.id ?? null,
        p_limit: PAGE_SIZE,
      }), signal);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        requester_id: row.requester_id,
        addressee_id: row.addressee_id,
        status: row.status as Friendship['status'],
        created_at: row.created_at,
        accepted_at: row.accepted_at,
        requester: {
          id: row.requester_id,
          username: row.requester_username,
          display_name: row.requester_display_name,
          avatar_url: row.requester_avatar_url,
          avatar_gradient: row.requester_avatar_gradient,
          equipped_border_key: row.requester_equipped_border_key,
        } as Profile,
      }));
    },
    initialPageParam: null as { createdAt: string; id: string } | null,
    getNextPageParam: (lastPage) => {
      const tail = lastPage.at(-1);
      return lastPage.length === PAGE_SIZE && tail
        ? { createdAt: tail.created_at, id: tail.id }
        : undefined;
    },
    enabled: Boolean(userId) && enabled,
    staleTime: 30_000,
  });
}

export function useFriendRequestCount(enabled = true) {
  const userId = useAuthStore((state) => state.session?.user?.id);
  return useQuery({
    queryKey: ['friendRequests', userId, 'count'],
    queryFn: async ({ signal }): Promise<number> => {
      if (!userId) return 0;
      const { data, error } = await runAbortableQuery(supabase.rpc('friend_request_count'), signal);
      if (error) throw error;
      return data ?? 0;
    },
    enabled: Boolean(userId) && enabled,
    staleTime: 30_000,
  });
}

export function useRespondToFriendRequest() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.session?.user?.id);
  return useMutation({
    mutationKey: ['respondToFriendRequest'],
    retry: false,
    mutationFn: async (variables: {
      friendshipId: string;
      accept: boolean;
      commandId?: string;
    }) => {
      if (!userId || useAuthStore.getState().session?.user.id !== userId)
        throw new Error('Not authenticated');
      variables.commandId ??= newCommandId('friend-response');
      const { error } = await executeCommand('respond_to_friendship', {
        p_friendship_id: variables.friendshipId,
        p_accept: variables.accept,
        p_idempotency_key: variables.commandId,
      });
      if (error) throw error;
    },
    onMutate: async (variables) => {
      variables.commandId ??= newCommandId('friend-response');
      const account = captureProfileAccount();
      if (!userId || account.userId !== userId) throw new Error('Not authenticated');
      await queryClient.cancelQueries({
        predicate: (query) =>
          ['friendship', 'friendRequests'].includes(String(query.queryKey[0])) &&
          query.queryKey[1] === userId,
      }, { silent: true });
      if (!account.isCurrent()) throw new Error('Not authenticated');
      return { account };
    },
    onSuccess: (_result, variables, context) => {
      if (!context?.account.isCurrent()) return;
      // Keep the responding row mounted until acknowledgement. Updating only
      // confirmed records avoids whole-list rollback clobbering another response.
      const requestQueries = queryClient.getQueriesData<InfiniteData<FriendshipWithRequester[]>>({
        predicate: (query) =>
          query.queryKey[0] === 'friendRequests' && query.queryKey[1] === userId &&
          query.queryKey[2] === 'paged',
      });
      const matchedRequest = requestQueries
        .flatMap(([, data]) => data?.pages.flat() ?? [])
        .find((request) => request.id === variables.friendshipId);
      const matchedQueryKey = userId && matchedRequest
        ? ['friendship', userId, matchedRequest.requester_id] as const
        : null;
      if (variables.accept) {
        queryClient.setQueriesData<Friendship | null>(
          { predicate: (query) => query.queryKey[0] === 'friendship' && query.queryKey[1] === userId },
          (current) => current?.id === variables.friendshipId
            ? { ...current, status: 'accepted', accepted_at: new Date().toISOString() }
            : current,
        );
        if (matchedRequest && matchedQueryKey) {
          queryClient.setQueryData<Friendship>(
            matchedQueryKey,
            {
              ...matchedRequest,
              status: 'accepted',
              accepted_at: new Date().toISOString(),
            },
          );
          queryClient.setQueriesData(
            {
              predicate: ({ queryKey: key }) =>
                ((key[0] === 'searchUsers' || key[0] === 'commentLikes') && key[2] === userId) ||
                (key[0] === 'pollVotersDetail' && key[4] === userId) ||
                (key[0] === 'reactions' && key[3] === userId),
            },
            (current) => patchCachedFriendshipStatus(
              current,
              matchedRequest.requester_id,
              'friends',
            ),
          );
        }
      }
      queryClient.setQueriesData<InfiniteData<FriendshipWithRequester[]>>(
        {
          predicate: (query) =>
            query.queryKey[0] === 'friendRequests' && query.queryKey[1] === userId &&
            query.queryKey[2] === 'paged',
        },
        (current) => current
          ? {
              ...current,
              pages: current.pages.map((page) =>
                page.filter((request) => request.id !== variables.friendshipId),
              ),
            }
          : current,
      );
      scheduleQueryInvalidation(queryClient, [
        'friendRequests', 'friends', 'feed', 'friendship', 'notificationCenter',
        'searchUsers', 'pollVotersDetail', 'commentLikes', 'reactions',
      ]);
      invalidateFriendCountQueries(queryClient);
    },
  });
}
