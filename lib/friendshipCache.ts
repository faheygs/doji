import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { Friendship } from '../types/database';

export type CachedFriendshipStatus =
  | 'none'
  | 'friends'
  | 'pending_out'
  | 'pending_in'
  | 'blocked';

export const FRIENDSHIP_STATUS_ROOTS = new Set([
  'searchUsers',
  'pollVotersDetail',
  'commentLikes',
  'reactions',
]);

/** Patch only viewer-relative rows; the server snapshot remains authoritative. */
export function patchCachedFriendshipStatus(
  value: unknown,
  targetUserId: string,
  status: CachedFriendshipStatus,
): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const patched = patchCachedFriendshipStatus(item, targetUserId, status);
      changed ||= patched !== item;
      return patched;
    });
    return changed ? next : value;
  }
  if (!value || typeof value !== 'object') return value;
  const row = value as Record<string, unknown>;
  const rowUserId = typeof row.user_id === 'string' ? row.user_id : row.id;
  let next: Record<string, unknown> = row;
  let changed = false;
  if (rowUserId === targetUserId && typeof row.friendship_status === 'string') {
    next = { ...row, friendship_status: status };
    changed = true;
  }
  for (const [key, child] of Object.entries(row)) {
    const patched = patchCachedFriendshipStatus(child, targetUserId, status);
    if (patched === child) continue;
    if (!changed) next = { ...row };
    next[key] = patched;
    changed = true;
  }
  return changed ? next : value;
}

export type OptimisticFriendRequestContext = {
  previous: Friendship | null | undefined;
  queryKey: QueryKey;
  relativeQueries: [QueryKey, unknown][];
};

export async function optimisticallyRequestFriendship(
  queryClient: QueryClient,
  requesterId: string,
  addresseeId: string,
  commandId: string,
): Promise<OptimisticFriendRequestContext> {
  const queryKey = ['friendship', requesterId, addresseeId] as const;
  await queryClient.cancelQueries({ queryKey }, { silent: true });
  const previous = queryClient.getQueryData<Friendship | null>(queryKey);
  const relativeQueries = queryClient.getQueriesData({
    predicate: (query) => FRIENDSHIP_STATUS_ROOTS.has(String(query.queryKey[0])),
  });
  queryClient.setQueryData<Friendship>(queryKey, {
    id: `optimistic:${commandId}`,
    requester_id: requesterId,
    addressee_id: addresseeId,
    status: 'pending',
    created_at: new Date().toISOString(),
    accepted_at: null,
  });
  queryClient.setQueriesData(
    { predicate: (query) => FRIENDSHIP_STATUS_ROOTS.has(String(query.queryKey[0])) },
    (current) => patchCachedFriendshipStatus(current, addresseeId, 'pending_out'),
  );
  return { previous, queryKey, relativeQueries };
}

export function rollbackOptimisticFriendRequest(
  queryClient: QueryClient,
  context: OptimisticFriendRequestContext | undefined,
) {
  if (!context) return;
  queryClient.setQueryData(context.queryKey, context.previous ?? null);
  for (const [key, data] of context.relativeQueries) queryClient.setQueryData(key, data);
}
