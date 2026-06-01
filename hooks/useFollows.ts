import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import type { Follow, Profile } from '../types/database';

/** Viewer-relative follow state between the signed-in user and a target profile. */
export type ViewerFollowStatus = 'none' | 'pending_out' | 'pending_in' | 'following' | 'blocked';

export type FollowWithProfile = Profile & { follow_id: string };

export type FollowRequest = Follow & { follower?: Profile | null };

export type FollowRelation = {
  status: ViewerFollowStatus;
  outgoing: Follow | null;
  incoming: Follow | null;
};

export function deriveFollowStatus(
  outgoing: Follow | null | undefined,
  incoming: Follow | null | undefined,
): ViewerFollowStatus {
  if (outgoing?.status === 'blocked' || incoming?.status === 'blocked') return 'blocked';
  if (outgoing?.status === 'accepted') return 'following';
  if (outgoing?.status === 'pending') return 'pending_out';
  if (incoming?.status === 'pending') return 'pending_in';
  return 'none';
}

export function useFollowRelation(targetUserId?: string) {
  const session = useAuthStore((s) => s.session);
  const me = session?.user?.id;

  return useQuery({
    queryKey: ['followRelation', me, targetUserId],
    queryFn: async (): Promise<FollowRelation> => {
      if (!me || !targetUserId || me === targetUserId) {
        return { status: 'none', outgoing: null, incoming: null };
      }

      const [{ data: outgoing }, { data: incoming }] = await Promise.all([
        supabase
          .from('follows')
          .select('*')
          .eq('follower_id', me)
          .eq('following_id', targetUserId)
          .maybeSingle(),
        supabase
          .from('follows')
          .select('*')
          .eq('follower_id', targetUserId)
          .eq('following_id', me)
          .maybeSingle(),
      ]);

      const out = (outgoing as Follow | null) ?? null;
      const inc = (incoming as Follow | null) ?? null;
      return { status: deriveFollowStatus(out, inc), outgoing: out, incoming: inc };
    },
    enabled: !!me && !!targetUserId && me !== targetUserId,
  });
}

export function useFollowStatus(targetUserId?: string) {
  const query = useFollowRelation(targetUserId);
  return {
    ...query,
    data: query.data?.status ?? ('none' as ViewerFollowStatus),
  };
}

export function useFollow() {
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);

  return useMutation({
    mutationFn: async (targetUserId: string) => {
      const me = session?.user?.id;
      if (!me) throw new Error('Not authenticated');

      const { data: target, error: profileError } = await supabase
        .from('profiles')
        .select('is_private')
        .eq('id', targetUserId)
        .maybeSingle();

      if (profileError) throw profileError;

      const isPrivate = !!(target as { is_private?: boolean } | null)?.is_private;
      const now = new Date().toISOString();
      const status = isPrivate ? 'pending' : 'accepted';

      const { error } = await supabase.from('follows').insert({
        follower_id: me,
        following_id: targetUserId,
        status,
        ...(status === 'accepted' ? { accepted_at: now } : {}),
      });

      if (error) throw error;
    },
    onSuccess: (_data, targetUserId) => {
      invalidateFollowQueries(queryClient, session?.user?.id);
      queryClient.invalidateQueries({ queryKey: ['followRelation', session?.user?.id, targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['followStatus', session?.user?.id, targetUserId] });
    },
  });
}

export function useUnfollow() {
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);

  return useMutation({
    mutationFn: async (targetUserId: string) => {
      const me = session?.user?.id;
      if (!me) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', me)
        .eq('following_id', targetUserId);

      if (error) throw error;
    },
    onSuccess: (_data, targetUserId) => {
      invalidateFollowQueries(queryClient, session?.user?.id);
      queryClient.invalidateQueries({ queryKey: ['followRelation', session?.user?.id, targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['followStatus', session?.user?.id, targetUserId] });
    },
  });
}

export function useRespondToFollowRequest() {
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);

  return useMutation({
    mutationFn: async ({ followId, accept }: { followId: string; accept: boolean }) => {
      if (accept) {
        const { error } = await supabase
          .from('follows')
          .update({ status: 'accepted', accepted_at: new Date().toISOString() })
          .eq('id', followId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('follows').delete().eq('id', followId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidateFollowQueries(queryClient, session?.user?.id);
    },
  });
}

export function useFollowers(userId?: string, enabled = true) {
  return useQuery({
    queryKey: ['followers', userId],
    queryFn: async (): Promise<FollowWithProfile[]> => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('follows')
        .select('id, follower:profiles!follows_follower_id_fkey(*)')
        .eq('following_id', userId)
        .eq('status', 'accepted');

      if (error) throw error;

      return ((data as unknown as { id: string; follower: Profile }[]) ?? [])
        .filter((row) => row.follower)
        .map((row) => ({ ...row.follower, follow_id: row.id }));
    },
    enabled: !!userId && enabled,
    placeholderData: (prev) => prev,
  });
}

export function useFollowing(userId?: string, enabled = true) {
  return useQuery({
    queryKey: ['following', userId],
    queryFn: async (): Promise<FollowWithProfile[]> => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('follows')
        .select('id, following:profiles!follows_following_id_fkey(*)')
        .eq('follower_id', userId)
        .eq('status', 'accepted');

      if (error) throw error;

      return ((data as unknown as { id: string; following: Profile }[]) ?? [])
        .filter((row) => row.following)
        .map((row) => ({ ...row.following, follow_id: row.id }));
    },
    enabled: !!userId && enabled,
    placeholderData: (prev) => prev,
  });
}

export function useFollowRequests() {
  const session = useAuthStore((s) => s.session);
  const me = session?.user?.id;

  return useQuery({
    queryKey: ['followRequests', me],
    queryFn: async (): Promise<FollowRequest[]> => {
      if (!me) return [];

      const { data, error } = await supabase
        .from('follows')
        .select('*, follower:profiles!follows_follower_id_fkey(*)')
        .eq('following_id', me)
        .eq('status', 'pending');

      if (error) throw error;
      return (data ?? []) as FollowRequest[];
    },
    enabled: !!me,
  });
}

export function useFollowerCount(targetUserId?: string) {
  return useQuery({
    queryKey: ['followerCount', targetUserId],
    queryFn: async (): Promise<number> => {
      if (!targetUserId) return 0;

      const { data, error } = await supabase.rpc('follower_count', { p_user_id: targetUserId });
      if (error) throw error;
      if (typeof data === 'number' && Number.isFinite(data)) return Math.max(0, Math.floor(data));
      const n = Number(data);
      return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    },
    enabled: !!targetUserId,
    staleTime: 30_000,
  });
}

export function useFollowingCount(targetUserId?: string) {
  return useQuery({
    queryKey: ['followingCount', targetUserId],
    queryFn: async (): Promise<number> => {
      if (!targetUserId) return 0;

      const { data, error } = await supabase.rpc('following_count', { p_user_id: targetUserId });
      if (error) throw error;
      if (typeof data === 'number' && Number.isFinite(data)) return Math.max(0, Math.floor(data));
      const n = Number(data);
      return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    },
    enabled: !!targetUserId,
    staleTime: 30_000,
  });
}

/**
 * Follow relation between the current user and a set of others.
 * Used for bulk action labels in profile sheets.
 */
export function useFollowStatusesBulkWithTargets(targetUserIds: readonly string[]) {
  const session = useAuthStore((s) => s.session);
  const me = session?.user?.id;
  const sortedKey = [...new Set(targetUserIds)].slice().sort().join(',');

  return useQuery({
    queryKey: ['followStatusesBulk', me, sortedKey],
    queryFn: async (): Promise<Record<string, FollowRelation>> => {
      if (!me || targetUserIds.length === 0) return {};
      const uniq = [...new Set(targetUserIds)];

      const [{ data: outgoing, error: eo }, { data: incoming, error: ei }] = await Promise.all([
        supabase.from('follows').select('*').eq('follower_id', me).in('following_id', uniq),
        supabase.from('follows').select('*').eq('following_id', me).in('follower_id', uniq),
      ]);

      if (eo) throw eo;
      if (ei) throw ei;

      const outByTarget = new Map<string, Follow>();
      for (const row of (outgoing ?? []) as Follow[]) {
        outByTarget.set(row.following_id, row);
      }

      const inByTarget = new Map<string, Follow>();
      for (const row of (incoming ?? []) as Follow[]) {
        inByTarget.set(row.follower_id, row);
      }

      const result: Record<string, FollowRelation> = {};
      for (const id of uniq) {
        const out = outByTarget.get(id) ?? null;
        const inc = inByTarget.get(id) ?? null;
        result[id] = { status: deriveFollowStatus(out, inc), outgoing: out, incoming: inc };
      }
      return result;
    },
    enabled: !!me && targetUserIds.length > 0,
    staleTime: 15_000,
  });
}

export function invalidateFollowQueries(queryClient: QueryClient, me?: string) {
  void queryClient.invalidateQueries({
    predicate: (q) =>
      Array.isArray(q.queryKey) &&
      (q.queryKey[0] === 'followRelation' ||
        q.queryKey[0] === 'followStatus' ||
        q.queryKey[0] === 'followers' ||
        q.queryKey[0] === 'following' ||
        q.queryKey[0] === 'followRequests' ||
        q.queryKey[0] === 'followerCount' ||
        q.queryKey[0] === 'followingCount' ||
        q.queryKey[0] === 'followCounts' ||
        q.queryKey[0] === 'followStatusesBulk'),
  });
  if (me) {
    queryClient.invalidateQueries({ queryKey: ['following', me] });
    queryClient.invalidateQueries({ queryKey: ['followers', me] });
  }
  queryClient.invalidateQueries({ queryKey: ['feed'] });
  queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
  queryClient.invalidateQueries({
    predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'notificationCenter',
  });
}
