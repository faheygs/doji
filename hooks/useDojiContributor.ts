import { useQuery } from '@tanstack/react-query';
import { captureProfileAccount, useAuthStore } from '../stores/useAuthStore';
import { readDojiContributor } from '../lib/dojiContributor';
import { firstDojiEnabled } from '../lib/firstDoji';

/** Optional, viewer-authorized attribution must never delay participation. */
export function useDojiContributor(eventId: string | undefined, visible = true) {
  const viewerId = useAuthStore((state) => state.session?.user.id);
  const enabled = firstDojiEnabled() && !!viewerId && !!eventId && visible;
  const query = useQuery({
    queryKey: ['dojiContributor', eventId, viewerId],
    queryFn: async ({ signal }) => {
      const account = captureProfileAccount();
      if (!eventId || account.userId !== viewerId || !account.isCurrent())
        throw new Error('Not authenticated');
      const result = await readDojiContributor(eventId, signal);
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
  return { ...query, data: enabled && !query.isError ? query.data : null };
}
