import { useHeartMutation } from './useHeartMutation';

export function useTogglePollVoteLike() {
  return useHeartMutation('pollVote', (vars: {
    pollVoteId: string; liked: boolean; commandId?: string;
  }) => vars.pollVoteId);
}
