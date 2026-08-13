import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import type { Report } from '../types/database';
import { newCommandId } from '../lib/idempotency';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';

export type { Report };

export function usePendingReports(enabled = true) {
  const isAdmin = useAuthStore((s) => s.profile?.is_admin);

  return useQuery<Report[]>({
    queryKey: ['admin', 'reports', 'pending'],
    queryFn: async (): Promise<Report[]> => {
      const { data, error } = await supabase
        .from('reports')
        .select(
          `*,
          reporter:profiles!reports_reporter_fkey(username, display_name, avatar_url),
          reported_user:profiles!reports_reported_fkey(username, display_name, avatar_url),
          post:posts!reports_post_fkey(caption, photo_url),
          comment:comments!reports_comment_fkey(body),
          poll_vote:poll_votes!reports_poll_vote_id_fkey(custom_text)`,
        )
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) throw error;
      return (data ?? []) as Report[];
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
      const { error } = await supabase.rpc('moderate_report', {
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
