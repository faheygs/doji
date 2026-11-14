import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/useAuthStore';
import type { UserEvent } from '../types/database';
import { filterContent } from '../lib/contentFilter';
import { occurrenceCommandId, runSingleFlight } from '../lib/idempotency';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';
import { executeCommand } from '../lib/commandGateway';
import { beginSubmissionJourney, submissionStep } from '../lib/submissionJourney';

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
    mutationKey: ['pollVote'],
    mutationFn: async (variables: VoteArgs) => {
      const { optionId, userEventId, customText } = variables;
      if (!userId) throw new Error('Not authenticated');
      const commandId = variables.commandId ?? occurrenceCommandId('poll-vote', userEventId);

      return runSingleFlight(commandId, async () => {
        if (customText) {
          const check = filterContent(customText);
          if (!check.ok) throw new Error(check.reason);
        }
        const journey = beginSubmissionJourney(userId, userEventId);
        submissionStep(journey, 'submit', 'started');
        const { error: voteErr } = await executeCommand('submit_poll_vote', {
          p_user_event_id: userEventId,
          p_option_id: optionId,
          p_custom_text: customText?.trim() || null,
          p_idempotency_key: commandId,
        });
        if (voteErr) { submissionStep(journey, 'submit', 'failed', voteErr); throw voteErr; }
        submissionStep(journey, 'submit', 'confirmed');
      });
    },
    onSuccess: (_data, variables) => {
      if (!userId || useAuthStore.getState().session?.user.id !== userId) return;
      const key = ['userEvent', 'today', userId] as const;
      const prev = qc.getQueryData<UserEvent | null>(key);
      if (prev && prev.id !== variables.userEventId) return;
      // Unlock only after commit. A speculative unlock can cache an empty feed
      // from a read that started before the vote existed on the server.
      const reads = {
        predicate: (query: { queryKey: readonly unknown[] }) =>
          ['feed', 'pollResults', 'pollVotersDetail'].includes(String(query.queryKey[0])) &&
          query.queryKey.includes(userId) &&
          !!prev?.daily_event_id && query.queryKey.includes(prev.daily_event_id),
      };
      void qc.cancelQueries(reads);
      void qc.invalidateQueries({ ...reads, refetchType: 'none' });
      void qc.cancelQueries({ queryKey: key }, { revert: false, silent: true });
      if (prev?.id === variables.userEventId) {
        qc.setQueryData<UserEvent>(key, {
          ...prev,
          status: prev.status === 'buy_in_open' ? 'late' : 'completed',
          completed_at: new Date().toISOString(),
        });
      }
      // Do not wait for background reads before returning to the feed. Cancel
      // pre-commit reads rather than joining them through the realtime batcher.
      void qc.refetchQueries({ ...reads, type: 'active' });
      void qc.refetchQueries({ queryKey: key });
      scheduleQueryInvalidation(qc, [
        'profile',
        'leaderboard',
      ]);
      void fetchProfile(userId);
    },
  });
}
