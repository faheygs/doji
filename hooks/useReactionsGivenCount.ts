import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useDemoStore } from '../stores/useDemoStore';
import { DEMO_ME_PROFILE } from '../constants/demoData';

/** Total reactions this user has given (all posts; not RLS-filtered). */
export function useReactionsGivenCount(userId: string | undefined) {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);

  return useQuery({
    queryKey: isDemoMode ? ['reactionsGiven', 'demo'] : ['reactionsGiven', userId],
    queryFn: async (): Promise<number> => {
      if (isDemoMode) return DEMO_ME_PROFILE.reactions_received;
      if (!userId) return 0;
      const { data, error } = await supabase.rpc('get_reactions_given_count', {
        p_user_id: userId,
      });
      if (error) throw error;
      return typeof data === 'number' ? data : 0;
    },
    enabled: isDemoMode || !!userId,
    staleTime: isDemoMode ? Infinity : 15_000,
  });
}
