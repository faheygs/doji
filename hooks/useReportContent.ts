import { useMutation } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import type { ReportReason } from '../types/database';
import { newCommandId } from '../lib/idempotency';

export type { ReportReason };

export type ReportContentInput = {
  reportedUserId: string;
  postId?: string;
  commentId?: string;
  pollVoteId?: string;
  reason: ReportReason;
  commandId?: string;
};

export function useReportContent() {
  const userId = useAuthStore((s) => s.session?.user?.id);

  return useMutation({
    mutationFn: async (variables: ReportContentInput) => {
      const { reportedUserId, postId, commentId, pollVoteId, reason } = variables;
      if (!userId) throw new Error('Not authenticated');
      variables.commandId ??= newCommandId('content-report');
      const { error } = await supabase.rpc('submit_content_report', {
        p_reported_user_id: reportedUserId,
        p_post_id: postId ?? null,
        p_comment_id: commentId ?? null,
        p_poll_vote_id: pollVoteId ?? null,
        p_reason: reason,
        p_idempotency_key: variables.commandId,
      });
      if (error) throw error;
    },
  });
}
