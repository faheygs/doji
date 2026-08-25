import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { runAbortableQuery } from '../lib/requestSignal';

export type ChallengeSuggestionCounts = {
  /** Rows you submitted (any state). */
  submitted: number;
  /** Submissions that were selected for a daily challenge. */
  picked: number;
};

/**
 * Progress toward `challenge_idea` / `challenge_idea_picked` badges.
 */
export function useChallengeSuggestionCounts(userId: string | undefined) {
  return useQuery({
    queryKey: ['challengeSuggestionCounts', userId],
    queryFn: async ({ signal }): Promise<ChallengeSuggestionCounts> => {
      if (!userId) return { submitted: 0, picked: 0 };

      const [subRes, pickedRes] = await Promise.all([
        runAbortableQuery(supabase
          .from('challenge_suggestions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId), signal),
        runAbortableQuery(supabase
          .from('challenge_suggestions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .not('selected_at', 'is', null), signal),
      ]);

      if (subRes.error) throw subRes.error;
      if (pickedRes.error) throw pickedRes.error;

      return {
        submitted: subRes.count ?? 0,
        picked: pickedRes.count ?? 0,
      };
    },
    enabled: !!userId,
    staleTime: 15_000,
  });
}
