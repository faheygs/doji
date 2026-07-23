import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';

/** Returns a Set of poll_vote_ids liked by the current user for a given list of vote ids. */
export function useMyPollVoteLikes(voteIds: string[]) {
  const userId = useAuthStore((s) => s.session?.user?.id);
  const sortedKey = voteIds.slice().sort().join(',');

  return useQuery<Set<string>>({
    queryKey: ['pollVoteLikes', 'mine', userId, sortedKey],
    queryFn: async (): Promise<Set<string>> => {
      if (!userId || voteIds.length === 0) return new Set();
      const { data, error } = await supabase
        .from('poll_vote_likes')
        .select('poll_vote_id')
        .eq('user_id', userId)
        .in('poll_vote_id', voteIds);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.poll_vote_id as string));
    },
    enabled: !!userId && voteIds.length > 0,
    staleTime: 30_000,
  });
}

/** Returns total like counts keyed by poll_vote_id for a list of vote ids. */
export function usePollVoteLikeCounts(voteIds: string[]) {
  const sortedKey = voteIds.slice().sort().join(',');

  return useQuery<Map<string, number>>({
    queryKey: ['pollVoteLikes', 'counts', sortedKey],
    queryFn: async (): Promise<Map<string, number>> => {
      if (voteIds.length === 0) return new Map();
      const { data, error } = await supabase
        .from('poll_vote_likes')
        .select('poll_vote_id')
        .in('poll_vote_id', voteIds);
      if (error) throw error;
      const counts = new Map<string, number>();
      for (const row of data ?? []) {
        const id = row.poll_vote_id as string;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      return counts;
    },
    enabled: voteIds.length > 0,
    staleTime: 30_000,
  });
}

export function useTogglePollVoteLike() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user?.id);

  return useMutation({
    mutationFn: async ({ pollVoteId, liked }: { pollVoteId: string; liked: boolean }) => {
      if (!userId) throw new Error('Not authenticated');
      if (liked) {
        const { error } = await supabase
          .from('poll_vote_likes')
          .delete()
          .eq('user_id', userId)
          .eq('poll_vote_id', pollVoteId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('poll_vote_likes')
          .insert({ user_id: userId, poll_vote_id: pollVoteId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pollVoteLikes'] });
    },
  });
}
