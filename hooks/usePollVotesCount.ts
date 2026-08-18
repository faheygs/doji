import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

/** How many polls the user has voted in (rows in `poll_votes`). */
export function usePollVotesCount(userId: string | undefined) {
  return useQuery({
    queryKey: ['pollVotesCount', userId],
    queryFn: async (): Promise<number> => {
      if (!userId) return 0;
      const { count, error } = await supabase
        .from('poll_votes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!userId,
    staleTime: 15_000,
  });
}
