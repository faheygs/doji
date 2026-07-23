import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import { useDemoStore } from '../stores/useDemoStore';
import type { UserEvent } from '../types/database';
import { filterContent } from '../lib/contentFilter';

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
      if (customText) {
        const check = filterContent(customText);
        if (!check.ok) throw new Error(check.reason);
      }
      // In demo mode: skip all DB writes
      if (useDemoStore.getState().isDemoMode) return;

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
    onMutate: async (vars) => {
      if (!userId) return;
      const isDemoMode = useDemoStore.getState().isDemoMode;
      if (isDemoMode) {
        const store = useDemoStore.getState();
        // Poll/WYR: one shared community post only — just track the vote for highlighting
        store.addDemoVote(vars.challengeId, vars.optionId);
        store.completeDemoChallenge();
        return { prev: null, key: null };
      }
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
      return { prev, key };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx?.prev || !ctx?.key) return;
      qc.setQueryData(ctx.key as any, ctx.prev);
    },
    onSuccess: async (_data, variables) => {
      // In demo mode: skip all invalidations — static data needs no refresh
      if (useDemoStore.getState().isDemoMode) return;
      void qc.invalidateQueries({ queryKey: ['userEvent'], refetchType: 'none' });
      void qc.invalidateQueries({ queryKey: ['pollResults', variables.challengeId] });
      void qc.invalidateQueries({ queryKey: ['pollVotersDetail', variables.challengeId] });
      void qc.invalidateQueries({ queryKey: ['profile'] });
      void qc.invalidateQueries({ queryKey: ['leaderboard'] });
      void qc.invalidateQueries({ queryKey: ['profilePosts'] });
      try {
        await qc.refetchQueries({ queryKey: ['feed'] });
      } catch {
        // Non-fatal — navigation still proceeds; user can pull-to-refresh.
      }
      if (userId) fetchProfile(userId);
    },
  });
}
