import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { runAbortableQuery } from './requestSignal';
import { fetchPublicProfileView } from './profileQueries';
import { normalizePublicProfile, parsePublicProfileView } from './publicProfileView';
import type { Friendship } from '../types/database';

export function friendshipOptions(userId: string | undefined, targetId: string | undefined) {
  return queryOptions({
    queryKey: ['friendship', userId, targetId],
    queryFn: async ({ signal }): Promise<Friendship | null> => {
      if (!userId || !targetId) return null;
      const query = supabase
        .from('friendships')
        .select('id, requester_id, addressee_id, status, created_at, accepted_at')
        .or(
          `and(requester_id.eq.${userId},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${userId})`,
        );
      const { data } = await runAbortableQuery(
        {
          retry: (enabled) => query.retry(enabled),
          abortSignal: (requestSignal) => query.abortSignal(requestSignal).maybeSingle(),
        },
        signal,
      );
      return data as Friendship | null;
    },
    enabled: !!userId && !!targetId,
    staleTime: 30_000,
  });
}

export function memberProfileOptions(
  username: string,
  userId: string | undefined,
  client: QueryClient,
) {
  return queryOptions({
    // Visibility is viewer-relative even though the projection contains public fields.
    queryKey: ['profile', username, userId],
    queryFn: async ({ signal }) => {
      if (!username || !userId) return { status: 'not_found' as const, profile: null };
      const view = parsePublicProfileView(await fetchPublicProfileView(username, signal));
      const profile = normalizePublicProfile(view.profile);
      if (profile && !signal.aborted) {
        // Begin the dependent read before the route renders. Navigation and the
        // screen share this exact query, avoiding duplicate requests or fake rows.
        void client.prefetchQuery(friendshipOptions(userId, profile.id));
      }
      return { ...view, profile };
    },
    enabled: !!username && !!userId,
    staleTime: 30_000,
  });
}

export function friendshipMatchesTarget(
  row: Friendship | null | undefined,
  viewer?: string,
  target?: string,
) {
  return (
    row === null ||
    (!!row &&
      !!viewer &&
      !!target &&
      ((row.requester_id === viewer && row.addressee_id === target) ||
        (row.requester_id === target && row.addressee_id === viewer)))
  );
}
