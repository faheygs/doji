import { useMutation } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import type { ReportReason } from '../types/database';

export type { ReportReason };

export type ReportContentInput = {
  reportedUserId: string;
  postId?: string;
  commentId?: string;
  pollVoteId?: string;
  reason: ReportReason;
};

export function useReportContent() {
  const userId = useAuthStore((s) => s.session?.user?.id);

  return useMutation({
    mutationFn: async ({ reportedUserId, postId, commentId, pollVoteId, reason }: ReportContentInput) => {
      if (!userId) throw new Error('Not authenticated');
      const { error } = await supabase.from('reports').insert({
        reporter_id: userId,
        reported_user_id: reportedUserId,
        post_id: postId ?? null,
        comment_id: commentId ?? null,
        poll_vote_id: pollVoteId ?? null,
        reason,
      });
      if (error) throw error;
    },
  });
}
