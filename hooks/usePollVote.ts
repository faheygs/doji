import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import type { UserEvent } from '../types/database';
import { filterContent } from '../lib/contentFilter';
import { occurrenceCommandId, runSingleFlight } from '../lib/idempotency';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';

type VoteArgs = {
  challengeId: string;
  optionId: string;
  optionIndex: number;
  userEventId: string;
  customText?: string | null;
  commandId?: string;
};

export function usePollVote() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user?.id);
  const fetchProfile = useAuthStore((s) => s.fetchProfile);

  return useMutation({
    mutationFn: async (variables: VoteArgs) => {
      const { optionId, userEventId, customText } = variables;
      if (!userId) throw new Error('Not authenticated');
      const commandId = variables.commandId ?? occurrenceCommandId('poll-vote', userEventId);

      return runSingleFlight(commandId, async () => {
        if (customText) {
          const check = filterContent(customText);
          if (!check.ok) throw new Error(check.reason);
        }
        const { error: voteErr } = await supabase.rpc('submit_poll_vote', {
          p_user_event_id: userEventId,
          p_option_id: optionId,
          p_custom_text: customText?.trim() || null,
          p_idempotency_key: commandId,
        });
        if (voteErr) throw voteErr;
      });
    },
    onMutate: async () => {
      if (!userId) return;
      const key = ['userEvent', 'today', userId] as const;
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<UserEvent | null>(key);
      if (prev) {
        qc.setQueryData<UserEvent>(key, {
          ...prev,
          status: prev.status === 'buy_in_open' ? 'late' : 'completed',
          completed_at: new Date().toISOString(),
        });
      }
      return { prev, key };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx?.prev || !ctx?.key) return;
      qc.setQueryData(ctx.key as any, ctx.prev);
    },
    onSuccess: () => {
      if (userId) {
        void qc.refetchQueries(
          { queryKey: ['userEvent', 'today', userId] },
          { cancelRefetch: false },
        );
      }
      scheduleQueryInvalidation(qc, [
        'pollResults',
        'pollVotersDetail',
        'profile',
        'leaderboard',
        'feed',
      ]);
      if (userId) fetchProfile(userId);
    },
  });
}
