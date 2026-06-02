import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

/** Total reactions this user has given (all posts; not RLS-filtered). */
export function useReactionsGivenCount(userId: string | undefined) {
  return useQuery({
    queryKey: ['reactionsGiven', userId],
    queryFn: async (): Promise<number> => {
      if (!userId) return 0;
      const { data, error } = await supabase.rpc('get_reactions_given_count', {
        p_user_id: userId,
      });
      if (error) throw error;
      return typeof data === 'number' ? data : 0;
    },
    enabled: !!userId,
    staleTime: 15_000,
  });
}
