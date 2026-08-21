import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import type { ChallengeSuggestion, ChallengeSuggestionStatus } from '../types/database';
import { newCommandId } from '../lib/idempotency';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';

export function useMySuggestions(userId: string | undefined) {
  return useQuery<ChallengeSuggestion[]>({
    queryKey: ['mySuggestions', userId],
    queryFn: async (): Promise<ChallengeSuggestion[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('challenge_suggestions')
        .select('id, user_id, kind, body, body_hash, options, status, admin_note, selected_at, reviewed_at, reviewed_by, created_at, reviewer:profiles!challenge_suggestions_reviewed_by_fkey(id, username, display_name, avatar_url)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as ChallengeSuggestion[];
    },
    enabled: !!userId,
    staleTime: 15_000,
  });
}

export function usePendingSuggestions(enabled = true) {
  const isAdmin = useAuthStore((s) => s.profile?.is_admin);

  return useQuery<ChallengeSuggestion[]>({
    queryKey: ['pendingSuggestions'],
    queryFn: async (): Promise<ChallengeSuggestion[]> => {
      const { data, error } = await supabase.rpc('get_pending_suggestions_snapshot', {
        p_limit: 100,
      });
      if (error) throw error;
      return (data ?? []) as ChallengeSuggestion[];
    },
    enabled: !!isAdmin && enabled,
    staleTime: 10_000,
    placeholderData: (prev) => prev,
  });
}

type ReviewPayload = {
  id: string;
  status: Extract<ChallengeSuggestionStatus, 'approved' | 'rejected'>;
  adminNote?: string | null;
  commandId?: string;
};

export function useReviewSuggestion() {
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);

  return useMutation({
    mutationFn: async (variables: ReviewPayload) => {
      const { id, status, adminNote } = variables;
      const reviewerId = session?.user?.id;
      if (!reviewerId) throw new Error('Not authenticated');
      variables.commandId ??= newCommandId('suggestion-review');
      const { error } = await supabase.rpc('review_challenge_suggestion', {
        p_suggestion_id: id,
        p_status: status,
        p_admin_note: adminNote ?? null,
        p_idempotency_key: variables.commandId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      scheduleQueryInvalidation(queryClient, [
        'pendingSuggestions', 'mySuggestions', 'challengeSuggestionCounts',
      ]);
    },
  });
}

export function suggestionStatusColor(
  status: ChallengeSuggestionStatus,
  colors: { success: string; warning: string; error: string; textTertiary: string },
): string {
  switch (status) {
    case 'approved':
      return colors.success;
    case 'rejected':
      return colors.error;
    default:
      return colors.warning;
  }
}

export function suggestionKindLabel(kind: string): string {
  switch (kind) {
    case 'poll':
      return 'Poll';
    case 'wyr':
      return 'Would you rather';
    case 'question':
      return 'Question';
    case 'format_question':
      return 'Format question';
    case 'photo_idea':
      return 'Photo idea';
    default:
      return kind.replace(/_/g, ' ');
  }
}
