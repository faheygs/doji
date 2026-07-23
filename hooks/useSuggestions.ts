import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import { useDemoStore } from '../stores/useDemoStore';
import { mapSuggestionKindToChallengeRow } from '../lib/challengeSuggestions';
import type { AnswerRule, ChallengeSuggestion, ChallengeSuggestionStatus } from '../types/database';

export function useMySuggestions(userId: string | undefined) {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);

  return useQuery<ChallengeSuggestion[]>({
    queryKey: isDemoMode ? ['mySuggestions', 'demo'] : ['mySuggestions', userId],
    queryFn: async () => {
      if (isDemoMode) return [];
      if (!userId) return [];
      const { data, error } = await supabase
        .from('challenge_suggestions')
        .select('*, reviewer:profiles!reviewed_by(id, username, display_name, avatar_url)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: isDemoMode || !!userId,
    staleTime: isDemoMode ? Infinity : 15_000,
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

      if (status === 'approved') {
        const { data: suggestion, error: fetchErr } = await supabase
          .from('challenge_suggestions')
          .select('*')
          .eq('id', id)
          .single();
        if (fetchErr) throw fetchErr;
        if (!suggestion) throw new Error('Suggestion not found');

        const isPoll = suggestion.kind === 'poll' || suggestion.kind === 'wyr';
        const mapped = mapSuggestionKindToChallengeRow(suggestion.kind);
        const answerRule =
          !isPoll &&
          suggestion.options &&
          typeof suggestion.options === 'object' &&
          !Array.isArray(suggestion.options) &&
          'answer_rule' in (suggestion.options as Record<string, unknown>)
            ? (((suggestion.options as { answer_rule: AnswerRule }).answer_rule) ?? null)
            : null;

        const { data: challenge, error: chErr } = await supabase
          .from('challenges')
          .insert({
            title: suggestion.body.slice(0, 200),
            description: suggestion.body,
            type: mapped.type,
            category: mapped.category,
            difficulty: 2,
            xp_reward: 50,
            requires_photo: mapped.requires_photo,
            requires_video: mapped.requires_video,
            requires_text: mapped.requires_text,
            answer_rule: answerRule,
            is_active: true,
            is_demo: false,
            schedule_count: 0,
            emoji: null,
            participant_count: 0,
          })
          .select('id')
          .single();
        if (chErr) throw chErr;

        if (isPoll) {
          const options = Array.isArray(suggestion.options) ? (suggestion.options as string[]) : [];
          if (options.length < 2) {
            await supabase.from('challenges').delete().eq('id', challenge.id);
            throw new Error('Suggestion is missing poll options');
          }
          const { error: poErr } = await supabase.from('poll_options').insert(
            options.map((text, i) => ({
              challenge_id: challenge.id,
              text: String(text).slice(0, 200),
              position: i,
              vote_count: 0,
            })),
          );
          if (poErr) {
            await supabase.from('challenges').delete().eq('id', challenge.id);
            throw poErr;
          }
        }

        const { error } = await supabase
          .from('challenge_suggestions')
          .update({
            status,
            admin_note: adminNote ?? null,
            reviewed_at: new Date().toISOString(),
            reviewed_by: reviewerId,
            selected_at: new Date().toISOString(),
          })
          .eq('id', id);
        if (error) throw error;
        return;
      }

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
