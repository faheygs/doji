import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { attachReactionFields } from '../lib/postReactions';
import { useAuthStore } from '../stores/useAuthStore';
import { useDemoStore } from '../stores/useDemoStore';
import { FALLBACK_AVATAR_GRADIENT } from '../constants/theme';
import { normalizeUsernameInput } from './useUsernameAvailability';
import {
  DEMO_USERS,
  DEMO_ALL_USER_POSTS,
  DEMO_FEED_POSTS_BY_TYPE,
} from '../constants/demoData';
import type { Profile, Post, Friendship, FriendshipWithRequester } from '../types/database';

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
  const isDemoMode = useDemoStore((s) => s.isDemoMode);

  return useQuery({
    queryKey: isDemoMode ? ['profile', normalized, 'demo'] : ['profile', normalized],
    queryFn: async (): Promise<Profile | null> => {
      if (!normalized) return null;
      if (isDemoMode) {
        if (normalized === 'demo_me') return useAuthStore.getState().profile;
        return DEMO_USERS[normalized] ?? null;
      }
      const { data, error } = await supabase.rpc('get_profile_by_username', {
        p_username: normalized,
      });
      if (error) {
        if (__DEV__) console.warn('[useProfile]', error.message);
        return null;
      }
      return parseProfileRow(data);
    },
    enabled: !!normalized,
    staleTime: isDemoMode ? Infinity : 30_000,
    placeholderData: (prev) => prev,
  });
}

/** Single post — same shape as feed (for profile grid → detail). */
export function usePost(postId?: string) {
  const session = useAuthStore((s) => s.session);
  const me = session?.user?.id;
  const isDemoMode = useDemoStore((s) => s.isDemoMode);

  return useQuery({
    queryKey: isDemoMode ? ['post', postId, 'demo'] : ['post', postId, me],
    queryFn: async (): Promise<Post | null> => {
      if (!postId) return null;
      if (isDemoMode) {
        for (const posts of Object.values(DEMO_FEED_POSTS_BY_TYPE)) {
          const found = posts.find((p) => p.id === postId);
          if (found) return found;
        }
        return useDemoStore.getState().demoFeedPosts.find((p) => p.id === postId) ?? null;
      }
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
    staleTime: isDemoMode ? Infinity : 15_000,
  });
}

export function useProfilePosts(userId?: string) {
  const session = useAuthStore((s) => s.session);
  const me = session?.user?.id;
  const isDemoMode = useDemoStore((s) => s.isDemoMode);

  return useQuery({
    queryKey: isDemoMode ? ['profilePosts', userId, 'demo'] : ['profilePosts', userId, me],
    queryFn: async () => {
      if (!userId) return [];
      if (isDemoMode) {
        // Static demo posts by this user
        const staticPosts = DEMO_ALL_USER_POSTS.filter((p) => p.user_id === userId);
        // Dynamic posts added during demo session (e.g. user completed a challenge)
        const dynamicPosts = useDemoStore.getState().demoFeedPosts.filter(
          (p) => p.user_id === userId && !p.is_community_poll,
        );
        return [...dynamicPosts, ...staticPosts];
      }
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
    staleTime: isDemoMode ? Infinity : 15_000,
  });
}

export function useFriendship(targetUserId?: string) {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id;
  const isDemoMode = useDemoStore((s) => s.isDemoMode);

  return useQuery({
    queryKey: isDemoMode
      ? ['friendship', userId, targetUserId, 'demo']
      : ['friendship', userId, targetUserId],
    queryFn: async (): Promise<Friendship | null> => {
      if (!userId || !targetUserId) return null;
      if (isDemoMode) {
        const { demoFriendIds, demoPendingSentIds, demoPendingReceivedIds } =
          useDemoStore.getState();
        const ts = new Date().toISOString();
        if (demoFriendIds.includes(targetUserId)) {
          return {
            id: `demo-friendship-${targetUserId}`,
            requester_id: userId,
            addressee_id: targetUserId,
            status: 'accepted',
            accepted_at: ts,
            created_at: ts,
          };
        }
        if (demoPendingSentIds.includes(targetUserId)) {
          return {
            id: `demo-friendship-${targetUserId}`,
            requester_id: userId,
            addressee_id: targetUserId,
            status: 'pending',
            accepted_at: null,
            created_at: ts,
          };
        }
        if (demoPendingReceivedIds.includes(targetUserId)) {
          return {
            id: `demo-friendship-${targetUserId}`,
            requester_id: targetUserId,
            addressee_id: userId,
            status: 'pending',
            accepted_at: null,
            created_at: ts,
          };
        }
        return null;
      }
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
    staleTime: isDemoMode ? Infinity : 30_000,
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
    mutationFn: async (addresseeId: string) => {
      const requesterId = session?.user?.id;
      if (!requesterId) throw new Error('Not authenticated');
      if (useDemoStore.getState().isDemoMode) {
        useDemoStore.getState().sendDemoFriendRequest(addresseeId);
        return;
      }
      const { error } = await supabase.from('friendships').insert({
        requester_id: requesterId,
        addressee_id: addresseeId,
        status: 'pending',
      });
      if (error) throw error;
    },
    onSuccess: (_data, addresseeId) => {
      void queryClient.invalidateQueries({ queryKey: ['friendship', session?.user?.id, addresseeId] });
      void queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
      void queryClient.invalidateQueries({ queryKey: ['friends'] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      void queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'notificationCenter',
      });
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
      if (useDemoStore.getState().isDemoMode) {
        const targetId = friendshipId.replace('demo-friendship-', '');
        if (accept) {
          useDemoStore.getState().acceptDemoFriendRequest(targetId);
        } else {
          useDemoStore.getState().declineDemoFriendRequest(targetId);
        }
        return;
      }
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
      void queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
      void queryClient.invalidateQueries({ queryKey: ['friends'] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'friendship' });
      void queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'notificationCenter',
      });
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
  const isDemoMode = useDemoStore((s) => s.isDemoMode);

  return useQuery({
    queryKey: isDemoMode ? ['friends', 'demo'] : ['friends', userId],
    queryFn: async (): Promise<(Profile & { friendship_id: string })[]> => {
      if (isDemoMode) {
        const { demoFriendIds } = useDemoStore.getState();
        const allUsers = Object.values(DEMO_USERS);
        return demoFriendIds
          .map((id) => allUsers.find((u) => u.id === id))
          .filter((u): u is Profile => !!u)
          .map((u) => ({ ...u, friendship_id: `demo-friendship-${u.id}` }));
      }
      if (!userId) return [];

      const { data, error } = await supabase
        .from('friendships')
        .select('id, requester_id, addressee_id, requester:profiles!friendships_requester_id_fkey(*), addressee:profiles!friendships_addressee_id_fkey(*)')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
        .eq('status', 'accepted');

      if (error) throw error;

      const mapped = ((data as any[]) ?? []).map((f: { id: string; requester_id: string; addressee_id: string; requester: Profile; addressee: Profile }) => {
        const friend = f.requester_id === userId ? f.addressee : f.requester;
        return { ...friend, friendship_id: f.id };
      });
      return dedupeById(mapped);
    },
    enabled: isDemoMode || !!userId,
    staleTime: isDemoMode ? Infinity : 30_000,
  });
}

/** Accepted friendships count for any user (uses `friend_count` RPC; works for other peoples profiles under RLS). */
export function useFriendCount(targetUserId?: string) {
  const session = useAuthStore((s) => s.session);
  const me = session?.user?.id;
  const isDemoMode = useDemoStore((s) => s.isDemoMode);

  return useQuery({
    queryKey: isDemoMode
      ? ['friendCount', targetUserId, 'demo']
      : ['friendCount', targetUserId],
    queryFn: async (): Promise<number> => {
      if (!targetUserId) return 0;
      if (isDemoMode) {
        if (targetUserId === me) return useDemoStore.getState().demoFriendIds.length;
        return 5;
      }
      const { data, error } = await supabase.rpc('friend_count', { p_user_id: targetUserId });
      if (error) throw error;
      if (typeof data === 'number' && Number.isFinite(data)) return Math.max(0, Math.floor(data));
      const n = Number(data);
      return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    },
    enabled: isDemoMode ? !!targetUserId : !!targetUserId,
    staleTime: isDemoMode ? Infinity : 30_000,
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
  const session = useAuthStore((s) => s.session);
  const me = session?.user?.id;
  const isDemoMode = useDemoStore((s) => s.isDemoMode);

  return useQuery({
    queryKey: isDemoMode
      ? ['profileFriends', profileUserId, 'demo']
      : ['profileFriends', profileUserId],
    queryFn: async (): Promise<ProfileFriendListRow[]> => {
      if (!profileUserId) return [];
      if (isDemoMode) {
        const allUsers = Object.values(DEMO_USERS);
        let friends: Profile[];
        if (profileUserId === me) {
          const { demoFriendIds } = useDemoStore.getState();
          friends = demoFriendIds
            .map((id) => allUsers.find((u) => u.id === id))
            .filter((u): u is Profile => !!u);
        } else {
          const selfIdx = allUsers.findIndex((u) => u.id === profileUserId);
          friends = selfIdx >= 0
            ? [1, 2, 3, 4, 5].map((o) => allUsers[(selfIdx + o) % allUsers.length])
            : allUsers.slice(0, 5);
        }
        return friends.map((u) => ({
          friend_id: u.id,
          username: u.username,
          display_name: u.display_name,
          avatar_url: u.avatar_url,
          avatar_gradient: Array.isArray(u.avatar_gradient) && u.avatar_gradient.length >= 2
            ? u.avatar_gradient
            : [...FALLBACK_AVATAR_GRADIENT],
        }));
      }
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
          avatar_gradient:
            Array.isArray(row.avatar_gradient) && row.avatar_gradient.length >= 2
              ? row.avatar_gradient
              : [...FALLBACK_AVATAR_GRADIENT],
        })),
      );
    },
    enabled: (isDemoMode || !!profileUserId) && enabled,
    staleTime: isDemoMode ? Infinity : 25_000,
  });
}

/**
 * Friendship rows between the current user and a set of others (accepted + pending, etc.).
 * Used for bulk action labels in profile friend sheets.
 */
export function useFriendshipsBulkWithTargets(targetUserIds: readonly string[]) {
  const session = useAuthStore((s) => s.session);
  const me = session?.user?.id;
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  const sortedKey = [...new Set(targetUserIds)].slice().sort().join(',');

  return useQuery({
    queryKey: isDemoMode
      ? ['friendshipsBulk', 'demo', sortedKey]
      : ['friendshipsBulk', me, sortedKey],
    queryFn: async (): Promise<Record<string, Friendship>> => {
      if (!me) return {};
      if (isDemoMode) {
        const { demoFriendIds, demoPendingSentIds, demoPendingReceivedIds } =
          useDemoStore.getState();
        const ts = new Date().toISOString();
        const out: Record<string, Friendship> = {};
        for (const targetId of new Set(targetUserIds)) {
          if (demoFriendIds.includes(targetId)) {
            out[targetId] = {
              id: `demo-friendship-${targetId}`,
              requester_id: me,
              addressee_id: targetId,
              status: 'accepted',
              accepted_at: ts,
              created_at: ts,
            };
          } else if (demoPendingSentIds.includes(targetId)) {
            out[targetId] = {
              id: `demo-friendship-${targetId}`,
              requester_id: me,
              addressee_id: targetId,
              status: 'pending',
              accepted_at: null,
              created_at: ts,
            };
          } else if (demoPendingReceivedIds.includes(targetId)) {
            out[targetId] = {
              id: `demo-friendship-${targetId}`,
              requester_id: targetId,
              addressee_id: me,
              status: 'pending',
              accepted_at: null,
              created_at: ts,
            };
          }
        }
        return out;
      }
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
    enabled: !!me && (isDemoMode || targetUserIds.length > 0),
    staleTime: isDemoMode ? Infinity : 15_000,
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
  const isDemoMode = useDemoStore((s) => s.isDemoMode);

  return useQuery({
    queryKey: isDemoMode ? ['friendRequests', 'demo'] : ['friendRequests', userId],
    queryFn: async (): Promise<FriendshipWithRequester[]> => {
      if (isDemoMode) {
        const { demoPendingReceivedIds } = useDemoStore.getState();
        const allUsers = Object.values(DEMO_USERS);
        const ts = new Date().toISOString();
        return demoPendingReceivedIds
          .map((id) => allUsers.find((u) => u.id === id))
          .filter((u): u is Profile => !!u)
          .map((u) => ({
            id: `demo-friendship-${u.id}`,
            requester_id: u.id,
            addressee_id: userId ?? '',
            status: 'pending' as const,
            accepted_at: null,
            created_at: ts,
            requester: u,
          }));
      }
      if (!userId) return [];

      const { data, error } = await supabase
        .from('friendships')
        .select('*, requester:profiles!friendships_requester_id_fkey(*)')
        .eq('addressee_id', userId)
        .eq('status', 'pending');

      if (error) throw error;
      return (data ?? []) as FriendshipWithRequester[];
    },
    enabled: isDemoMode || !!userId,
  });
}

export function useRemoveFriend() {
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);

  return useMutation({
    mutationFn: async (friendshipId: string) => {
      if (useDemoStore.getState().isDemoMode) {
        const targetId = friendshipId.replace('demo-friendship-', '');
        useDemoStore.getState().removeDemoFriend(targetId);
        return;
      }
      const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['friends'] });
      void queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'friendship' });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      void queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'notificationCenter',
      });
      invalidateFriendCountQueries(queryClient);
    },
  });
}

export function useSearchUsers(query: string) {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);

  return useQuery({
    queryKey: isDemoMode
      ? ['searchUsers', 'demo', query || '__browse__']
      : ['searchUsers', query || '__browse__'],
    queryFn: async (): Promise<Profile[]> => {
      if (isDemoMode) {
        const allUsers = Object.values(DEMO_USERS);
        if (!query || query.length < 2) return allUsers;
        const q = query.toLowerCase();
        return allUsers.filter(
          (u) =>
            u.username.includes(q) ||
            (u.display_name?.toLowerCase() ?? '').includes(q),
        );
      }
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
    staleTime: isDemoMode ? Infinity : undefined,
  });
}
