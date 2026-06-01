import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import type { ChallengeSuggestion, ChallengeSuggestionStatus } from '../types/database';

export function useMySuggestions(userId: string | undefined) {
  return useQuery<ChallengeSuggestion[]>({
    queryKey: ['mySuggestions', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('challenge_suggestions')
        .select('*, reviewer:profiles!reviewed_by(id, username, display_name, avatar_url)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
    staleTime: 15_000,
  });
}

export function usePendingSuggestions(enabled = true) {
  const isAdmin = useAuthStore((s) => s.profile?.is_admin);

  return useQuery<ChallengeSuggestion[]>({
    queryKey: ['pendingSuggestions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('challenge_suggestions')
        .select('*, profile:profiles!user_id(id, username, display_name, avatar_url)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
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
};

export function useReviewSuggestion() {
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);

  return useMutation({
    mutationFn: async ({ id, status, adminNote }: ReviewPayload) => {
      const reviewerId = session?.user?.id;
      if (!reviewerId) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('challenge_suggestions')
        .update({
          status,
          admin_note: adminNote ?? null,
          reviewed_at: new Date().toISOString(),
          reviewed_by: reviewerId,
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pendingSuggestions'] });
      void queryClient.invalidateQueries({ queryKey: ['mySuggestions'] });
      void queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] === 'challengeSuggestionCounts',
      });
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
