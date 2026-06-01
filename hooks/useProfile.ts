import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { attachReactionFields } from '../lib/postReactions';
import { useAuthStore } from '../stores/useAuthStore';
import { FALLBACK_AVATAR_GRADIENT } from '../constants/theme';
import type { Profile, Post, Friendship, FriendshipWithRequester } from '../types/database';

export function useProfile(username?: string) {
  return useQuery({
    queryKey: ['profile', username],
    queryFn: async (): Promise<Profile | null> => {
      if (!username) return null;

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username)
        .maybeSingle();

      if (error) return null;
      return data;
    },
    enabled: !!username,
    placeholderData: (prev) => prev,
  });
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
          `*, profile:profiles(*), user_event:user_events(*, daily_event:daily_events(*, challenge:challenges(*)))`,
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
  });
}

export function useSendFriendRequest() {
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);

  return useMutation({
    mutationFn: async (addresseeId: string) => {
      const requesterId = session?.user?.id;
      if (!requesterId) throw new Error('Not authenticated');

      const { error } = await supabase.from('friendships').insert({
        requester_id: requesterId,
        addressee_id: addresseeId,
        status: 'pending',
      });

      if (error) throw error;
    },
    onSuccess: (_data, addresseeId) => {
      queryClient.invalidateQueries({ queryKey: ['friendship', session?.user?.id, addresseeId] });
      queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
      invalidateFriendCountQueries(queryClient);
    },
  });
}

export function useRespondToFriendRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      friendshipId,
      accept,
    }: {
      friendshipId: string;
      accept: boolean;
    }) => {
      const updates: { status: string; accepted_at?: string } = {
        status: accept ? 'accepted' : 'blocked',
      };
      if (accept) {
        updates.accepted_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from('friendships')
        .update(updates as any)
        .eq('id', friendshipId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'friendship' });
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'notificationCenter',
      });
      invalidateFriendCountQueries(queryClient);
    },
  });
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
        .select('id, requester_id, addressee_id, requester:profiles!friendships_requester_id_fkey(*), addressee:profiles!friendships_addressee_id_fkey(*)')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
        .eq('status', 'accepted');

      if (error) throw error;

      return ((data as any[]) ?? []).map((f: { id: string; requester_id: string; addressee_id: string; requester: Profile; addressee: Profile }) => {
        const friend = f.requester_id === userId ? f.addressee : f.requester;
        return { ...friend, friendship_id: f.id };
      });
    },
    enabled: !!userId,
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

export type FollowCounts = { followers: number; following: number };

/** Follower / following counts via remodel RPCs. */
export function useFollowCounts(targetUserId?: string) {
  return useQuery({
    queryKey: ['followCounts', targetUserId],
    queryFn: async (): Promise<FollowCounts> => {
      if (!targetUserId) return { followers: 0, following: 0 };

      const [followersRes, followingRes] = await Promise.all([
        supabase.rpc('follower_count', { p_user_id: targetUserId }),
        supabase.rpc('following_count', { p_user_id: targetUserId }),
      ]);

      if (followersRes.error) throw followersRes.error;
      if (followingRes.error) throw followingRes.error;

      const toInt = (v: unknown) => {
        if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.floor(v));
        const n = Number(v);
        return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
      };

      return {
        followers: toInt(followersRes.data),
        following: toInt(followingRes.data),
      };
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
      return rows.map((row) => ({
        friend_id: row.friend_id,
        username: row.username,
        display_name: row.display_name,
        avatar_url: row.avatar_url ?? null,
        avatar_gradient:
          Array.isArray(row.avatar_gradient) && row.avatar_gradient.length >= 2
            ? row.avatar_gradient
            : [...FALLBACK_AVATAR_GRADIENT],
      }));
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
      if (!me || targetUserIds.length === 0) return {};
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
  void queryClient.invalidateQueries({
    predicate: (q) =>
      Array.isArray(q.queryKey) &&
      (q.queryKey[0] === 'friendCount' ||
        q.queryKey[0] === 'profileFriends' ||
        q.queryKey[0] === 'friendshipsBulk'),
  });
}

export function useFriendRequests() {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id;

  return useQuery({
    queryKey: ['friendRequests', userId],
    queryFn: async (): Promise<FriendshipWithRequester[]> => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('friendships')
        .select('*, requester:profiles!friendships_requester_id_fkey(*)')
        .eq('addressee_id', userId)
        .eq('status', 'pending');

      if (error) throw error;
      return (data ?? []) as FriendshipWithRequester[];
    },
    enabled: !!userId,
  });
}

export function useRemoveFriend() {
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);

  return useMutation({
    mutationFn: async (friendshipId: string) => {
      const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends', session?.user?.id] });
      queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'friendship' });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'notificationCenter',
      });
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
          .select('*')
          .ilike('username', `%${query}%`)
          .limit(20);
        if (error) throw error;
        return data ?? [];
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: true,
  });
}
