import { useQuery } from '@tanstack/react-query';
import { captureProfileAccount, useAuthStore } from '../stores/useAuthStore';
import { firstDojiEnabled, readFirstDoji } from '../lib/firstDoji';
import type { FeedAudience } from '../lib/feedAudience';

export function useFirstDoji(
  eventId: string | undefined,
  audience: FeedAudience,
  unlocked: boolean,
) {
  const viewerId = useAuthStore((state) => state.session?.user.id);
  const enabled = firstDojiEnabled() && !!viewerId && !!eventId && unlocked;
  const query = useQuery({
    queryKey: ['firstDoji', eventId, audience, viewerId],
    queryFn: async ({ signal }) => {
      const account = captureProfileAccount();
      if (!eventId || account.userId !== viewerId || !account.isCurrent())
        throw new Error('Not authenticated');
      const result = await readFirstDoji(eventId, audience, signal);
      if (!account.isCurrent()) throw new Error('Account changed');
      return result;
    },
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnMount: 'always',
    refetchOnReconnect: 'always',
  });
  // An optional celebration never blocks the feed or invents a winner on failure.
  return { ...query, data: enabled && !query.isError ? query.data : null };
}
