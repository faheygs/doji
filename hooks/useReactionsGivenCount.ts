import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { runAbortableQuery } from '../lib/requestSignal';

/** Total reactions this user has given (all posts; not RLS-filtered). */
export function useReactionsGivenCount(userId: string | undefined) {
  return useQuery({
    queryKey: ['reactionsGiven', userId],
    queryFn: async ({ signal }): Promise<number> => {
      if (!userId) return 0;
      const { data, error } = await runAbortableQuery(supabase.rpc('get_reactions_given_count', {
        p_user_id: userId,
      }), signal);
      if (error) throw error;
      return typeof data === 'number' ? data : 0;
    },
    enabled: !!userId,
    staleTime: 15_000,
  });
}
