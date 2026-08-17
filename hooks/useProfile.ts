import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { attachReactionFields } from '../lib/postReactions';
import { useAuthStore } from '../stores/useAuthStore';
import { FALLBACK_AVATAR_GRADIENT } from '../constants/theme';
import { normalizeUsernameInput } from './useUsernameAvailability';
import type { Profile, Post, Friendship, FriendshipWithRequester } from '../types/database';
import { newCommandId } from '../lib/idempotency';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';
import { PUBLIC_PROFILE_COLUMNS } from '../lib/profileFields';
import { parsePublicProfileView } from '../lib/publicProfileView';
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
    queryFn: async () => {
      if (!normalized) return { status: 'not_found' as const, profile: null };
      const { data, error } = await supabase.rpc('get_public_profile_view', {
        p_username: normalized,
      });
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
    queryFn: async (): Promise<Post | null> => {
      if (!postId) return null;
      const { data, error } = await supabase
        .from('posts')
        .select(
          `*, profile:profiles(${PUBLIC_PROFILE_COLUMNS}), user_event:user_events(*, daily_event:daily_events(*, challenge:challenges(*)))`,
        )
        .eq('id', postId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const mapped = {
        ...(data as Post),
        challenge: (data as { user_event?: { daily_event?: { challenge?: unknown } } }).user_event
          ?.daily_event?.challenge ?? null,
      } as Post;

      const [withReaction] = await attachReactionFields([mapped], me);
      return withReaction as Post;
    },
    enabled: !!postId,
    staleTime: 15_000,
  });
}

export function useProfilePosts(userId?: string) {
  const session = useAuthStore((s) => s.session);
  const me = session?.user?.id;
  return useQuery({
    queryKey: ['profilePosts', userId, me],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('posts')
        .select('*, user_event:user_events(*, daily_event:daily_events(*, challenge:challenges(*)))')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      const mapped = (data ?? []).map((p: any) => ({
        ...p,
        challenge: p.user_event?.daily_event?.challenge ?? null,
      }));
      return attachReactionFields(mapped, me);
    },
    enabled: !!userId,
    staleTime: 15_000,
  });
}

export function useFriendship(targetUserId?: string) {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id;
  return useQuery({
    queryKey: ['friendship', userId, targetUserId],
    queryFn: async (): Promise<Friendship | null> => {
      if (!userId || !targetUserId) return null;
      const { data } = await supabase
        .from('friendships')
        .select('*')
        .or(
          `and(requester_id.eq.${userId},addressee_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},addressee_id.eq.${userId})`,
        )
        .maybeSingle();

      return data;
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
      const { error } = await supabase.rpc('request_friendship', {
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

export function useRespondToFriendRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: {
      friendshipId: string;
      accept: boolean;
      commandId?: string;
    }) => {
      const { friendshipId, accept } = variables;
      variables.commandId ??= newCommandId('friend-response');
      const { error } = await supabase.rpc('respond_to_friendship', {
        p_friendship_id: friendshipId,
        p_accept: accept,
        p_idempotency_key: variables.commandId,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      scheduleQueryInvalidation(queryClient, [
        'friendRequests', 'friends', 'feed', 'friendship', 'notificationCenter',
      ]);
      invalidateFriendCountQueries(queryClient);
    },
  });
}

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

function dedupeProfileFriends(rows: ProfileFriendListRow[]): ProfileFriendListRow[] {
  const seen = new Set<string>();
  const out: ProfileFriendListRow[] = [];
  for (const row of rows) {
    if (seen.has(row.friend_id)) continue;
    seen.add(row.friend_id);
    out.push(row);
  }
  return out;
}

export function useFriends() {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id;
  return useQuery({
    queryKey: ['friends', userId],
    queryFn: async (): Promise<(Profile & { friendship_id: string })[]> => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('friendships')
        .select(`id, requester_id, addressee_id, requester:profiles!friendships_requester_id_fkey(${PUBLIC_PROFILE_COLUMNS}), addressee:profiles!friendships_addressee_id_fkey(${PUBLIC_PROFILE_COLUMNS})`)
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
        .eq('status', 'accepted');

      if (error) throw error;

      const mapped = ((data as any[]) ?? []).map((f: { id: string; requester_id: string; addressee_id: string; requester: Profile; addressee: Profile }) => {
        const friend = f.requester_id === userId ? f.addressee : f.requester;
        return { ...friend, friendship_id: f.id };
      });
      return dedupeById(mapped);
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}

/** Accepted friendships count for any user (uses `friend_count` RPC; works for other peoples profiles under RLS). */
export function useFriendCount(targetUserId?: string) {
  return useQuery({
    queryKey: ['friendCount', targetUserId],
    queryFn: async (): Promise<number> => {
      if (!targetUserId) return 0;
      const { data, error } = await supabase.rpc('friend_count', { p_user_id: targetUserId });
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
/** Friend list shown on someone's profile sheet (SECURITY DEFINER RPC). */
export function useProfileFriendsList(profileUserId?: string, enabled = true) {
  return useQuery({
    queryKey: ['profileFriends', profileUserId],
    queryFn: async (): Promise<ProfileFriendListRow[]> => {
      if (!profileUserId) return [];
      const { data, error } = await supabase.rpc('list_profile_friends', {
        p_profile_user_id: profileUserId,
      });
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      return dedupeProfileFriends(
        rows.map((row) => ({
          friend_id: row.friend_id,
          username: row.username,
          display_name: row.display_name,
          avatar_url: row.avatar_url ?? null,
          equipped_border_key: row.equipped_border_key ?? null,
          avatar_gradient:
            Array.isArray(row.avatar_gradient) && row.avatar_gradient.length >= 2
              ? row.avatar_gradient
              : [...FALLBACK_AVATAR_GRADIENT],
        })),
      );
    },
    enabled: !!profileUserId && enabled,
    staleTime: 25_000,
  });
}

/**
 * Friendship rows between the current user and a set of others (accepted + pending, etc.).
 * Used for bulk action labels in profile friend sheets.
 */
export function useFriendshipsBulkWithTargets(targetUserIds: readonly string[]) {
  const session = useAuthStore((s) => s.session);
  const me = session?.user?.id;
  const sortedKey = [...new Set(targetUserIds)].slice().sort().join(',');

  return useQuery({
    queryKey: ['friendshipsBulk', me, sortedKey],
    queryFn: async (): Promise<Record<string, Friendship>> => {
      if (!me) return {};
      if (targetUserIds.length === 0) return {};
      const uniq = [...new Set(targetUserIds)];

      const { data: outgoing, error: eo } = await supabase
        .from('friendships')
        .select('*')
        .eq('requester_id', me)
        .in('addressee_id', uniq);

      const { data: incoming, error: ei } = await supabase
        .from('friendships')
        .select('*')
        .eq('addressee_id', me)
        .in('requester_id', uniq);

      if (eo) throw eo;
      if (ei) throw ei;

      const out: Record<string, Friendship> = {};
      const combined = [...(outgoing ?? []), ...(incoming ?? [])] as Friendship[];
      for (const f of combined) {
        const other = f.requester_id === me ? f.addressee_id : f.requester_id;
        out[other] = f;
      }
      return out;
    },
    enabled: !!me && targetUserIds.length > 0,
    staleTime: 15_000,
  });
}

export function invalidateFriendCountQueries(queryClient: QueryClient) {
  scheduleQueryInvalidation(queryClient, ['friendCount', 'profileFriends', 'friendshipsBulk']);
}

export function useFriendRequests(enabled = true) {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id;
  return useQuery({
    queryKey: ['friendRequests', userId],
    queryFn: async (): Promise<FriendshipWithRequester[]> => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('friendships')
        .select(`*, requester:profiles!friendships_requester_id_fkey(${PUBLIC_PROFILE_COLUMNS})`)
        .eq('addressee_id', userId)
        .eq('status', 'pending');

      if (error) throw error;
      return (data ?? []) as FriendshipWithRequester[];
    },
    enabled: !!userId && enabled,
  });
}

export function useRemoveFriend() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (variables: { friendshipId: string; commandId?: string }) => {
      const { friendshipId } = variables;
      variables.commandId ??= newCommandId('friend-remove');
      const { error } = await supabase.rpc('remove_friendship', {
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

export function useSearchUsers(query: string) {
  return useQuery({
    queryKey: ['searchUsers', query || '__browse__'],
    queryFn: async (): Promise<Profile[]> => {
      if (query && query.length >= 2) {
        const { data, error } = await supabase
          .from('profiles')
          .select(PUBLIC_PROFILE_COLUMNS)
          .ilike('username', `%${query}%`)
          .limit(20);
        if (error) throw error;
        return (data ?? []) as unknown as Profile[];
      }

      const { data, error } = await supabase
        .from('profiles')
        .select(PUBLIC_PROFILE_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as Profile[];
    },
    enabled: query.length === 0 || query.length >= 2,
    staleTime: 30_000,
  });
}
