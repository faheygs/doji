import { type InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query';
import { executeCommand } from '../lib/commandGateway';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';
import { useAuthStore } from '../stores/useAuthStore';
import type { ReportReason, ReportReasonDetail, ReportTargetKind } from '../lib/reportingTaxonomy';
import { newCommandId } from '../lib/idempotency';
import type { Post } from '../types/database';
import { useRef } from 'react';

export type { ReportReason };

export type ReportContentInput = {
  reportedUserId: string;
  postId?: string;
  commentId?: string;
  pollVoteId?: string;
  targetKind: ReportTargetKind;
  reason: ReportReason;
  reasonDetail: ReportReasonDetail;
  notes?: string;
  commandId?: string;
};

export function useReportContent() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user?.id);
  // An ambiguous response is not a new intent. Preserve its receipt key through
  // manual retries (including a sheet close/reopen while this account host lives).
  const pendingIntent = useRef<{ signature: string; commandId: string } | null>(null);

  return useMutation({
    mutationFn: async (variables: ReportContentInput) => {
      const {
        reportedUserId,
        postId,
        commentId,
        pollVoteId,
        targetKind,
        reason,
        reasonDetail,
        notes,
      } = variables;
      if (!userId) throw new Error('Not authenticated');
      const signature = JSON.stringify([userId, reportedUserId, postId, commentId, pollVoteId,
        targetKind, reason, reasonDetail, notes?.trim() || null]);
      if (!variables.commandId) {
        if (pendingIntent.current?.signature !== signature) {
          pendingIntent.current = { signature, commandId: newCommandId('content-report') };
        }
        variables.commandId = pendingIntent.current.commandId;
      }
      const { error } = await executeCommand('submit_policy_report', {
        p_reported_user_id: reportedUserId,
        p_post_id: postId ?? null,
        p_comment_id: commentId ?? null,
        p_poll_vote_id: pollVoteId ?? null,
        p_target_kind: targetKind,
        p_reason: reason,
        p_reason_detail: reasonDetail,
        p_notes: notes?.trim() || null,
        p_idempotency_key: variables.commandId,
      });
      if (error) throw error;
      if (pendingIntent.current?.commandId === variables.commandId) pendingIntent.current = null;
    },
    onMutate: ({ postId }) => {
      if (!postId) return { previousFeeds: [], userId };
      const previousFeeds = queryClient.getQueriesData<InfiniteData<Post[]>>({
        predicate: (query) => query.queryKey[0] === 'feed',
      });
      void queryClient.cancelQueries(
        { predicate: (query) => query.queryKey[0] === 'feed' },
        { revert: false, silent: true },
      );
      queryClient.setQueriesData<InfiniteData<Post[]>>(
        { predicate: (query) => query.queryKey[0] === 'feed' },
        (old) => old
          ? { ...old, pages: old.pages.map((page) => page.filter((post) => post.id !== postId)) }
          : old,
      );
      const optimisticFeeds = queryClient.getQueriesData<InfiniteData<Post[]>>({
        predicate: (query) => query.queryKey[0] === 'feed',
      });
      return { previousFeeds, optimisticFeeds, userId };
    },
    onError: (_error, _variables, context) => {
      if (useAuthStore.getState().session?.user?.id !== context?.userId) return;
      for (const [queryKey, data] of context?.previousFeeds ?? []) {
        const optimistic = context?.optimisticFeeds?.find(([key]) => key === queryKey)?.[1];
        // Never replace a newer authorized read or resurrect an evicted cache.
        if (optimistic && queryClient.getQueryData(queryKey) === optimistic) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      // A lost response may have committed: reconcile through authorized reads.
      scheduleQueryInvalidation(queryClient, ['feed']);
    },
    onSuccess: (_data, _variables, context) => {
      if (useAuthStore.getState().session?.user?.id !== context?.userId) return;
      scheduleQueryInvalidation(queryClient, [
        'feed',
        'post',
        'profilePost',
        'comments',
        'pollResults',
        'pollVotersDetail',
      ]);
    },
  });
}
