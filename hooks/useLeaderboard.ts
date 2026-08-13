import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { InteractionManager } from 'react-native';
import { supabase } from '../lib/supabase';
import { weekStart } from '../lib/xp';
import { useAuthStore } from '../stores/useAuthStore';
import type { LeaderboardEntry } from '../types/database';
import { createRequestSignal } from '../lib/requestSignal';

export type LeaderboardMode = 'weekly' | 'alltime';
export type LeaderboardAudience = 'friends' | 'everyone';

async function fetchLeaderboard(
  mode: LeaderboardMode,
  audience: LeaderboardAudience,
  userId: string | undefined,
  signal?: AbortSignal,
): Promise<LeaderboardEntry[]> {
  if (audience === 'friends' && !userId) return [];
  const request = createRequestSignal(signal, 6_000);
  try {
    const { data, error } = await supabase.rpc('get_leaderboard_snapshot', {
      p_mode: mode,
      p_audience: audience,
      p_limit: 50,
    }).abortSignal(request.signal);
    if (error) throw error;
    return (data ?? []) as LeaderboardEntry[];
  } finally {
    request.cleanup();
  }
}

function leaderboardQueryKey(
  mode: LeaderboardMode,
  audience: LeaderboardAudience,
  userId: string | undefined,
) {
  return ['leaderboard', mode, audience, userId, mode === 'weekly' ? weekStart() : 'all'] as const;
}

export function warmLeaderboardCache(queryClient: QueryClient, userId: string | undefined) {
  if (!userId) return;
  const variants: [LeaderboardMode, LeaderboardAudience][] = [
    ['weekly', 'friends'], ['weekly', 'everyone'],
    ['alltime', 'friends'], ['alltime', 'everyone'],
  ];
  for (const [mode, audience] of variants) {
    void queryClient.prefetchQuery({
      queryKey: leaderboardQueryKey(mode, audience, userId),
      queryFn: ({ signal }) => fetchLeaderboard(mode, audience, userId, signal),
      staleTime: 60_000,
    });
  }
}

export function useLeaderboard(
  mode: LeaderboardMode = 'weekly',
  audience: LeaderboardAudience = 'everyone',
) {
  const userId = useAuthStore((s) => s.session?.user?.id);
  const queryClient = useQueryClient();

  const query = useQuery<LeaderboardEntry[]>({
    queryKey: leaderboardQueryKey(mode, audience, userId),
    queryFn: ({ signal }) => fetchLeaderboard(mode, audience, userId, signal),
    staleTime: 60_000,
    gcTime: 15 * 60_000,
    enabled: audience === 'everyone' || !!userId,
  });

  useEffect(() => {
    if (!query.data?.length) return;
    const task = InteractionManager.runAfterInteractions(() => {
      warmLeaderboardCache(queryClient, userId);
    });
    return () => task.cancel();
  }, [query.data?.length, queryClient, userId]);

  return query;
}
