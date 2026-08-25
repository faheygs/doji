import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { executeCommand } from '../lib/commandGateway';
import { useAuthStore } from '../stores/useAuthStore';
import type { Report } from '../types/database';
import { newCommandId } from '../lib/idempotency';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';
import { runAbortableQuery } from '../lib/requestSignal';
import { signReportMedia } from '../lib/postMedia';

export type { Report };

export function usePendingReports(enabled = true) {
  const isAdmin = useAuthStore((s) => s.profile?.is_admin);

  return useQuery<Report[]>({
    queryKey: ['admin', 'reports', 'pending'],
    queryFn: async ({ signal }): Promise<Report[]> => {
      const { data, error } = await runAbortableQuery(supabase.rpc('get_pending_reports_snapshot', {
        p_limit: 100,
      }), signal);

      if (error) throw error;
      return signReportMedia((data ?? []) as Report[]);
    },
    enabled: !!isAdmin && enabled,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export type ModerateAction = 'dismiss' | 'remove_content' | 'remove_and_ban';

export function useModerateReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: {
      reportId: string;
      action: ModerateAction;
      postId?: string | null;
      commentId?: string | null;
      reportedUserId?: string | null;
      commandId?: string;
    }) => {
      const {
      reportId,
      action,
      } = variables;
      variables.commandId ??= newCommandId('moderate-report');
      const { error } = await executeCommand('moderate_report', {
        p_report_id: reportId,
        p_action: action,
        p_idempotency_key: variables.commandId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      scheduleQueryInvalidation(queryClient, ['admin', 'feed']);
    },
  });
}
