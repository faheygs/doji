import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useDemoStore } from '../stores/useDemoStore';

/** How many polls the user has voted in (rows in `poll_votes`). */
export function usePollVotesCount(userId: string | undefined) {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);

  return useQuery({
    queryKey: isDemoMode ? ['pollVotesCount', 'demo'] : ['pollVotesCount', userId],
    queryFn: async (): Promise<number> => {
      if (isDemoMode) return 12;
      if (!userId) return 0;
      const { count, error } = await supabase
        .from('poll_votes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: isDemoMode || !!userId,
    staleTime: isDemoMode ? Infinity : 15_000,
  });
}
