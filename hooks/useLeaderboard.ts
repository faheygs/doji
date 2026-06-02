import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { weekStart } from '../lib/xp';
import { useAuthStore } from '../stores/useAuthStore';
import type { LeaderboardEntry, Profile } from '../types/database';

export type LeaderboardMode = 'weekly' | 'alltime';
export type LeaderboardAudience = 'friends' | 'everyone';

import { getFriendIdsIncludingSelf } from '../lib/friendGraph';

function rankEntries(
  rows: { user_id: string; xp: number; profile: LeaderboardEntry['profile'] }[],
): LeaderboardEntry[] {
  const sorted = [...rows].sort((a, b) => b.xp - a.xp);
  return sorted.map((row, idx) => ({
    rank: idx + 1,
    user_id: row.user_id,
    xp: row.xp,
    profile: row.profile,
  }));
}

export function useLeaderboard(
  mode: LeaderboardMode = 'weekly',
  audience: LeaderboardAudience = 'everyone',
) {
  const userId = useAuthStore((s) => s.session?.user?.id);
  const currentWeek = weekStart();

  return useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard', mode, audience, userId, mode === 'weekly' ? currentWeek : 'all'],
    queryFn: async () => {
      const friendIds =
        audience === 'friends' && userId ? await getFriendIdsIncludingSelf(userId) : null;

      let profileQuery = supabase.from('profiles').select('*').order('xp', { ascending: false });

      if (friendIds) {
        profileQuery = profileQuery.in('id', friendIds);
      } else {
        profileQuery = profileQuery.limit(50);
      }

      const { data: profiles, error: profileErr } = await profileQuery;
      if (profileErr) throw profileErr;

      const profileRows = (profiles ?? []) as Profile[];

      if (mode === 'alltime') {
        const rows = profileRows.map((row) => ({
          user_id: row.id,
          xp: row.xp ?? 0,
          profile: row,
        }));
        return rankEntries(rows).slice(0, 50);
      }

      const ws = currentWeek;
      const userIds = profileRows.map((p) => p.id);
      const weeklyMap = new Map<string, number>();

      if (userIds.length > 0) {
        const { data: weeklyRows, error: weeklyErr } = await supabase
          .from('weekly_xp')
          .select('user_id, xp')
          .eq('week_start', ws)
          .in('user_id', userIds);

        if (weeklyErr) throw weeklyErr;
        for (const row of weeklyRows ?? []) {
          weeklyMap.set(row.user_id as string, row.xp as number);
        }
      }

      const rows = profileRows.map((row) => ({
        user_id: row.id,
        xp: weeklyMap.get(row.id) ?? 0,
        profile: row,
      }));

      return rankEntries(rows).slice(0, 50);
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    enabled: audience === 'everyone' || !!userId,
    placeholderData: (prev, prevQuery) => {
      const prevKey = prevQuery?.queryKey;
      if (!prevKey || !prev) return undefined;
      const prevWeek = prevKey[4];
      if (mode === 'weekly' && prevWeek !== currentWeek) return undefined;
      if (prevKey[1] !== mode || prevKey[2] !== audience) return undefined;
      return prev;
    },
  });
}
