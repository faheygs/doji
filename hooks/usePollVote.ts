import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';

type VoteArgs = {
  challengeId: string;
  optionId: string;
  optionIndex: number;
  userEventId: string;
};

export function usePollVote() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user?.id);
  const fetchProfile = useAuthStore((s) => s.fetchProfile);

  return useMutation({
    mutationFn: async ({ challengeId, optionId, optionIndex, userEventId }: VoteArgs) => {
      if (!userId) throw new Error('Not authenticated');

      const { error: voteErr } = await supabase
        .from('poll_votes')
        .insert({ user_id: userId, challenge_id: challengeId, option_id: optionId });
      if (voteErr) throw voteErr;

      const { error: ueErr } = await supabase
        .from('user_events')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', userEventId);
      if (ueErr) throw ueErr;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['userEvent'] });
      qc.invalidateQueries({ queryKey: ['pollResults', variables.challengeId] });
      qc.invalidateQueries({ queryKey: ['pollVotersDetail', variables.challengeId] });
      qc.invalidateQueries({ queryKey: ['profile'] });
      qc.invalidateQueries({ queryKey: ['leaderboard'] });
      qc.invalidateQueries({ queryKey: ['profilePosts'] });
      if (userId) fetchProfile(userId);
    },
  });
}
