import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import type { UserEvent } from '../types/database';

type VoteArgs = {
  challengeId: string;
  optionId: string;
  optionIndex: number;
  userEventId: string;
  customText?: string | null;
};

export function usePollVote() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user?.id);
  const fetchProfile = useAuthStore((s) => s.fetchProfile);

  return useMutation({
    mutationFn: async ({ challengeId, optionId, optionIndex, userEventId, customText }: VoteArgs) => {
      if (!userId) throw new Error('Not authenticated');

      const { error: voteErr } = await supabase.from('poll_votes').insert({
        user_id: userId,
        challenge_id: challengeId,
        option_id: optionId,
        custom_text: customText?.trim() || null,
      });
      if (voteErr) throw voteErr;

      const { error: ueErr } = await supabase
        .from('user_events')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', userEventId);
      if (ueErr) throw ueErr;
    },
    onMutate: async () => {
      if (!userId) return;
      const key = ['userEvent', 'today', userId] as const;
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<UserEvent | null>(key);
      if (prev) {
        qc.setQueryData<UserEvent>(key, {
          ...prev,
          status: 'completed',
          completed_at: new Date().toISOString(),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (!userId || !ctx?.prev) return;
      qc.setQueryData(['userEvent', 'today', userId], ctx.prev);
    },
    onSuccess: async (_data, variables) => {
      // Fire-and-forget invalidations for non-feed queries
      void qc.invalidateQueries({ queryKey: ['userEvent'], refetchType: 'none' });
      void qc.invalidateQueries({ queryKey: ['pollResults', variables.challengeId] });
      void qc.invalidateQueries({ queryKey: ['pollVotersDetail', variables.challengeId] });
      void qc.invalidateQueries({ queryKey: ['profile'] });
      void qc.invalidateQueries({ queryKey: ['leaderboard'] });
      void qc.invalidateQueries({ queryKey: ['profilePosts'] });
      // Await the feed refetch before resolving. TanStack Query v5 awaits this
      // promise before calling the local onSuccess (navigation), so the user lands
      // on the feed with the poll card already loaded. isPending stays true during
      // this wait, keeping the submit button spinner visible.
      try {
        await qc.refetchQueries({ queryKey: ['feed'] });
      } catch {
        // Non-fatal — navigation still proceeds; user can pull-to-refresh.
      }
      if (userId) fetchProfile(userId);
    },
  });
}
