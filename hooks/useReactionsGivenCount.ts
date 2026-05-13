import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

/** Rows you gave (RLS = posts you can see); matches in-app reaction activity. */
export function useReactionsGivenCount(userId: string | undefined) {
  return useQuery({
    queryKey: ['reactionsGiven', userId],
    queryFn: async (): Promise<number> => {
      if (!userId) return 0;
      const { count, error } = await supabase
        .from('reactions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!userId,
    staleTime: 15_000,
  });
}
