import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';

export type HeartKind = 'comment' | 'pollVote';
export type HeartRow = { id?: string; vote_id?: string; my_like?: boolean; like_count?: number };
export type HeartTiming = { settledAt?: number; account?: { isCurrent: () => boolean } };
export function heartState<T extends HeartRow>(row: T, active: boolean, count?: number): T {
  return {
    ...row,
    my_like: active,
    like_count: count ?? Math.max(0, (row.like_count ?? 0) + (active ? 1 : -1)),
  };
}
export const heartMutationKey = (kind: HeartKind, userId: string | undefined) =>
  [kind === 'comment' ? 'toggleCommentLike' : 'togglePollVoteLike', userId] as const;
export const heartRowId = (kind: HeartKind, row: HeartRow) =>
  kind === 'comment' ? row.id : row.vote_id;
export const heartQueryOwnedBy = (kind: HeartKind, key: QueryKey, userId: string) =>
  kind === 'comment'
    ? key[0] === 'comments' && key[2] === userId
    : key[0] === 'pollVotersDetail' && key[4] === userId;

function targetId(kind: HeartKind, variables: unknown) {
  const value = variables as { commentId?: string; pollVoteId?: string } | undefined;
  return kind === 'comment' ? value?.commentId : value?.pollVoteId;
}

export function latestHeart(client: QueryClient, kind: HeartKind, userId: string, id: string) {
  return client
    .getMutationCache()
    .findAll({ mutationKey: heartMutationKey(kind, userId) })
    .filter((mutation) => targetId(kind, mutation.state.variables) === id)
    .at(-1);
}

export function patchHeart<T extends HeartRow>(
  data: InfiniteData<T[]> | undefined,
  kind: HeartKind,
  id: string,
  update: (row: T) => T,
): InfiniteData<T[]> | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) =>
      page.map((row) => (heartRowId(kind, row) === id ? update(row) : row)),
    ),
  };
}

/** Reconcile only authorized returned rows. An older read cannot undo a newer
 * local heart, but deletions, text edits and other actors' fields still reconcile.
 * These RPCs read Postgres directly, so no artificial cache-settle delay is needed.
 */
export function preserveHeartRead<T extends HeartRow>(
  client: QueryClient,
  kind: HeartKind,
  userId: string,
  key: QueryKey,
  startedAt: number,
  incoming: T[],
): T[] {
  const current = client.getQueryData<InfiniteData<T[]>>(key);
  if (!current) return incoming;
  const rows = new Map(current.pages.flat().map((row) => [heartRowId(kind, row), row]));
  const mutations = new Map(
    client
      .getMutationCache()
      .findAll({ mutationKey: heartMutationKey(kind, userId) })
      .map((mutation) => [targetId(kind, mutation.state.variables), mutation]),
  );
  return incoming.map((row) => {
    const id = heartRowId(kind, row);
    const prior = rows.get(id);
    if (!id || !prior) return row;
    const mutation = mutations.get(id);
    if (!mutation) return row;
    const timing = mutation.state.context as HeartTiming | undefined;
    if (timing?.account && !timing.account.isCurrent()) return row;
    const conflict =
      mutation.state.status === 'pending' ||
      mutation.state.submittedAt >= startedAt ||
      (timing?.settledAt ?? -1) >= startedAt;
    return conflict ? { ...row, my_like: prior.my_like, like_count: prior.like_count } : row;
  });
}
