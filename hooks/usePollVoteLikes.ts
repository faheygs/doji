import { type InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import { newCommandId } from '../lib/idempotency';

type VoterPageRow = { vote_id?: string; like_count?: number; my_like?: boolean };

function patchVoterLike(
  data: InfiniteData<VoterPageRow[]> | undefined,
  voteId: string,
  active: boolean,
  count?: number,
) {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) =>
      page.map((row) =>
        row.vote_id === voteId
          ? {
              ...row,
              my_like: active,
              like_count: count ?? Math.max(0, (row.like_count ?? 0) + (active ? 1 : -1)),
            }
          : row,
      ),
    ),
  };
}

export function useTogglePollVoteLike() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user?.id);

  return useMutation({
    mutationFn: async (variables: { pollVoteId: string; liked: boolean; commandId?: string }) => {
      if (!userId) throw new Error('Not authenticated');
      variables.commandId ??= newCommandId('poll-vote-like');
      const { data, error } = await supabase.rpc('toggle_poll_vote_like', {
        p_poll_vote_id: variables.pollVoteId,
        p_idempotency_key: variables.commandId,
      });
      if (error) throw error;
      return data as { poll_vote_id: string; active: boolean; count: number };
    },
    onMutate: ({ pollVoteId, liked }) => {
      const previous = queryClient.getQueriesData<InfiniteData<VoterPageRow[]>>({
        queryKey: ['pollVotersDetail'],
      });
      queryClient.setQueriesData<InfiniteData<VoterPageRow[]>>(
        { queryKey: ['pollVotersDetail'] },
        (old) => patchVoterLike(old, pollVoteId, !liked),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      for (const [queryKey, data] of context?.previous ?? []) {
        queryClient.setQueryData(queryKey, data);
      }
    },
    onSuccess: (result) => {
      queryClient.setQueriesData<InfiniteData<VoterPageRow[]>>(
        { queryKey: ['pollVotersDetail'] },
        (old) => patchVoterLike(old, result.poll_vote_id, result.active, result.count),
      );
    },
  });
}
