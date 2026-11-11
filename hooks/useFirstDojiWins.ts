import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { runMemberRead } from '../lib/runMemberRead';
import { captureProfileAccount, useAuthStore } from '../stores/useAuthStore';

/** Only mount after the server advertises the installed badge category. */
export function useFirstDojiWins(installed: boolean) {
  const userId = useAuthStore((state) => state.session?.user.id);
  const query = useQuery({
    queryKey: ['userBadgeProgress', userId, 'firstDojiWins'],
    enabled: installed && !!userId,
    queryFn: async ({ signal }) => {
      const account = captureProfileAccount();
      if (!userId || account.userId !== userId) throw new Error('Not authenticated');
      const { data } = await runMemberRead(supabase.rpc('get_my_first_doji_wins_v1'), signal);
      if (!account.isCurrent()) throw new Error('Account changed');
      if (typeof data !== 'number' || !Number.isSafeInteger(data) || data < 0)
        throw new Error('Invalid first-Doji count');
      return data;
    },
    staleTime: 30_000,
    retry: false,
  });
  return { ...query, data: installed && !query.isError ? query.data : undefined };
}
