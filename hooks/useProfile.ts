import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { attachReactionFields } from '../lib/postReactions';
import { useAuthStore } from '../stores/useAuthStore';
import { FALLBACK_AVATAR_GRADIENT } from '../constants/theme';
import { normalizeUsernameInput } from './useUsernameAvailability';
import type { Profile, Post, Friendship } from '../types/database';
import { newCommandId } from '../lib/idempotency';
import { executeCommand } from '../lib/commandGateway';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';
import { parsePublicProfileView } from '../lib/publicProfileView';
import { createRequestSignal, runAbortableQuery } from '../lib/requestSignal';
import { signPostMedia } from '../lib/postMedia';
function parseProfileRow(data: unknown): Profile | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Profile;
  if (!row.id || !row.username) return null;
  if (!Array.isArray(row.avatar_gradient) || row.avatar_gradient.length < 2) {
    row.avatar_gradient = [...FALLBACK_AVATAR_GRADIENT];
  }
  return row;
}

export function useProfile(username?: string) {
  const normalized = username ? normalizeUsernameInput(username) : '';
  const query = useQuery({
    queryKey: ['profile', normalized],
    queryFn: async ({ signal }) => {
      if (!normalized) return { status: 'not_found' as const, profile: null };
      const { data, error } = await runAbortableQuery(supabase.rpc('get_public_profile_view', {
        p_username: normalized,
      }), signal);
      if (error) {
        if (__DEV__) console.warn('[useProfile]', error.message);
        throw error;
      }
      const view = parsePublicProfileView(data);
      return { ...view, profile: parseProfileRow(view.profile) };
    },
    enabled: !!normalized,
    staleTime: 30_000,
  });
  return {
    ...query,
    data: query.data?.profile ?? null,
    blockedByUser: query.data?.status === 'blocked_by_user',
  };
}

/** Single post — same shape as feed (for profile grid → detail). */
export function usePost(postId?: string) {
  const session = useAuthStore((s) => s.session);
  const me = session?.user?.id;
  return useQuery({
    queryKey: ['post', postId, me],
    queryFn: async ({ signal }): Promise<Post | null> => {
      if (!postId) return null;
      const { data, error } = await runAbortableQuery(
        supabase.rpc('get_post_detail', { p_post_id: postId }),
        signal,
      );

      if (error) throw error;
      if (!data) return null;

      const [mapped] = await signPostMedia([data as Post]);

      const [withReaction] = await attachReactionFields([mapped], me, signal);
      return withReaction as Post;
    },
    enabled: !!postId,
    staleTime: 15_000,
  });
}

export function useFriendship(targetUserId?: string) {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id;
  return useQuery({
    queryKey: ['friendship', userId, targetUserId],
    queryFn: async ({ signal }): Promise<Friendship | null> => {
      if (!userId || !targetUserId) return null;
      const request = createRequestSignal(signal);
      let data: Friendship | null;
      let error: { message: string } | null;
      try {
        const result = await supabase
          .from('friendships')
          .select('id, requester_id, addressee_id, status, created_at, accepted_at')
          .or(
            `and(requester_id.eq.${userId},addressee_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},addressee_id.eq.${userId})`,
          )
          .abortSignal(request.signal)
          .maybeSingle();
        data = result.data as Friendship | null;
        error = result.error;
      } finally {
        request.cleanup();
      }

      if (error) throw error;
      return data as Friendship | null;
    },
    enabled: !!userId && !!targetUserId,
    staleTime: 30_000,
  });
}

/** Viewer-relative friendship state between the signed-in user and a target profile. */
export type ViewerFriendshipStatus = 'none' | 'pending_out' | 'pending_in' | 'friends' | 'blocked';

export function deriveFriendshipStatus(
  friendship: Friendship | null | undefined,
  me?: string,
): ViewerFriendshipStatus {
  if (!friendship || !me) return 'none';
  if (friendship.status === 'blocked') return 'blocked';
  if (friendship.status === 'accepted') return 'friends';
  if (friendship.status === 'pending') {
    return friendship.requester_id === me ? 'pending_out' : 'pending_in';
  }
  return 'none';
}

export function useFriendshipStatus(targetUserId?: string) {
  const session = useAuthStore((s) => s.session);
  const me = session?.user?.id;
  const query = useFriendship(targetUserId);
  return {
    ...query,
    data: deriveFriendshipStatus(query.data, me),
  };
}

export function useSendFriendRequest() {
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);

  return useMutation({
    mutationFn: async (variables: { addresseeId: string; commandId?: string }) => {
      const { addresseeId } = variables;
      const requesterId = session?.user?.id;
      if (!requesterId) throw new Error('Not authenticated');
      variables.commandId ??= newCommandId('friend-request');
      const { error } = await executeCommand('request_friendship', {
        p_addressee_id: addresseeId,
        p_idempotency_key: variables.commandId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      scheduleQueryInvalidation(queryClient, [
        'friendship', 'friendRequests', 'friends', 'feed', 'notificationCenter',
      ]);
      invalidateFriendCountQueries(queryClient);
    },
  });
}

/** Accepted friendships count for any user (uses `friend_count` RPC; works for other peoples profiles under RLS). */
export function useFriendCount(targetUserId?: string) {
  return useQuery({
    queryKey: ['friendCount', targetUserId],
    queryFn: async ({ signal }): Promise<number> => {
      if (!targetUserId) return 0;
      const { data, error } = await runAbortableQuery(
        supabase.rpc('friend_count', { p_user_id: targetUserId }),
        signal,
      );
      if (error) throw error;
      if (typeof data === 'number' && Number.isFinite(data)) return Math.max(0, Math.floor(data));
      const n = Number(data);
      return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    },
    enabled: !!targetUserId,
    staleTime: 30_000,
  });
}

export type ProfileFriendListRow = {
  friend_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_gradient: string[];
  equipped_border_key: string | null;
};
export function invalidateFriendCountQueries(queryClient: QueryClient) {
  scheduleQueryInvalidation(queryClient, ['friendCount', 'profileFriends']);
}

export function useRemoveFriend() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (variables: { friendshipId: string; commandId?: string }) => {
      const { friendshipId } = variables;
      variables.commandId ??= newCommandId('friend-remove');
      const { error } = await executeCommand('remove_friendship', {
        p_friendship_id: friendshipId,
        p_idempotency_key: variables.commandId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      scheduleQueryInvalidation(queryClient, [
        'friends', 'friendRequests', 'friendship', 'feed', 'notificationCenter',
      ]);
      invalidateFriendCountQueries(queryClient);
    },
  });
}

export type SearchProfile = Pick<
  Profile,
  'id' | 'username' | 'display_name' | 'avatar_url' | 'avatar_gradient' | 'equipped_border_key'
> & {
  friendship_status: 'none' | 'friends' | 'pending_out' | 'pending_in' | 'blocked';
};

export function useSearchUsers(query: string) {
  return useQuery({
    queryKey: ['searchUsers', query || '__browse__'],
    queryFn: async ({ signal }): Promise<SearchProfile[]> => {
      const { data, error } = await runAbortableQuery(supabase.rpc('search_profiles', {
        p_query: query,
        p_limit: 20,
      }), signal);
      if (error) throw error;
      return (data ?? []) as SearchProfile[];
    },
    enabled: query.length === 0 || query.length >= 2,
    staleTime: 30_000,
  });
}
