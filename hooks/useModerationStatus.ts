import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { executeCommand } from '../lib/commandGateway';
import { newCommandId } from '../lib/idempotency';
import { runAbortableQuery } from '../lib/requestSignal';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';

export type ModerationStatus = Awaited<
  ReturnType<typeof fetchModerationStatus>
>;

async function fetchModerationStatus(signal?: AbortSignal) {
  const { data, error } = await runAbortableQuery(
    supabase.rpc('get_my_moderation_status'),
    signal,
  );
  if (error) throw error;
  return data ?? { notices: [], decisions: [] };
}

export function useModerationStatus() {
  const userId = useAuthStore((state) => state.session?.user?.id);
  return useQuery({
    queryKey: ['moderationStatus', userId],
    queryFn: ({ signal }) => fetchModerationStatus(signal),
    enabled: Boolean(userId),
    staleTime: 15_000,
  });
}

export function useSubmitModerationAppeal() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.session?.user?.id);
  return useMutation({
    mutationFn: async (input: { decisionId: string; statement: string }) => {
      const { data, error } = await executeCommand('submit_moderation_appeal', {
        p_decision_id: input.decisionId,
        p_statement: input.statement,
        p_idempotency_key: newCommandId('moderation-appeal'),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['moderationStatus', userId] });
    },
  });
}
