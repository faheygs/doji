import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { attachReactionFields } from '../lib/postReactions';
import { useAuthStore } from '../stores/useAuthStore';
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
    },
  });
}

export function useFriends() {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id;

  return useQuery({
    queryKey: ['friends', userId],
    queryFn: async (): Promise<Profile[]> => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('friendships')
        .select('*, requester:profiles!friendships_requester_id_fkey(*), addressee:profiles!friendships_addressee_id_fkey(*)')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
        .eq('status', 'accepted');

      if (error) throw error;

      return (data ?? []).map((f: any) => {
        return f.requester_id === userId ? f.addressee : f.requester;
      }) as Profile[];
    },
    enabled: !!userId,
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
