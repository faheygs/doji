import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { weekStart } from '../lib/xp';
import type { LeaderboardEntry } from '../types/database';

export type LeaderboardMode = 'weekly' | 'alltime';

export function useLeaderboard(mode: LeaderboardMode = 'weekly') {
  return useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard', mode, mode === 'weekly' ? weekStart() : 'all'],
    queryFn: async () => {
      if (mode === 'alltime') {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .order('xp', { ascending: false })
          .limit(50);

        if (error) throw error;

        return (data ?? []).map((row: any, idx: number) => ({
          rank: idx + 1,
          user_id: row.id,
          xp: row.xp ?? 0,
          profile: row,
        }));
      }

      const ws = weekStart();
      const { data, error } = await supabase
        .from('weekly_xp')
        .select('user_id, xp, profile:profiles(*)')
        .eq('week_start', ws)
        .order('xp', { ascending: false })
        .limit(50);

      if (error) throw error;

      return (data ?? []).map((row: any, idx: number) => ({
        rank: idx + 1,
        user_id: row.user_id,
        xp: row.xp,
        profile: row.profile,
      }));
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
