import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { patchCommentWindow, type CommentPageRow, type CommentWindow } from './commentWindow';

export const ownedCommentWindow = (key: QueryKey, userId: string, postId?: string) =>
  key[0] === 'commentWindow' && key[2] === userId && (!postId || key[1] === postId);
type HeartBefore = { key: QueryKey; generation: symbol; my_like?: boolean; like_count: number };

export function patchWindowHearts(
  client: QueryClient,
  userId: string,
  postId: string | undefined,
  id: string,
  update: (row: CommentPageRow) => CommentPageRow,
): HeartBefore[] {
  const previous: HeartBefore[] = [];
  for (const [key, data] of client.getQueriesData<CommentWindow>({
    predicate: (query) => ownedCommentWindow(query.queryKey, userId, postId),
  })) {
    if (!data) continue;
    const row =
      data.pages.flatMap((page) => page.items).find((row) => row.id === id) ??
      (data.parentRow?.id === id ? data.parentRow : undefined);
    if (row)
      previous.push({
        key,
        generation: data.generation,
        my_like: row.my_like,
        like_count: row.like_count,
      });
    client.setQueryData<CommentWindow>(key, (old) => {
      if (!old) return old;
      const next = patchCommentWindow(old, id, update);
      return old.parentRow?.id === id
        ? { ...next, parentRow: update(old.parentRow), revision: next.revision + 1 }
        : next;
    });
  }
  return previous;
}

export function restoreWindowHearts(client: QueryClient, id: string, before: HeartBefore[]) {
  for (const prior of before)
    client.setQueryData<CommentWindow>(prior.key, (old) => {
      if (!old || old.generation !== prior.generation) return old;
      const restore = (row: CommentPageRow) => ({
        ...row,
        my_like: prior.my_like,
        like_count: prior.like_count,
      });
      const next = patchCommentWindow(old, id, restore);
      return old.parentRow?.id === id
        ? { ...next, parentRow: restore(old.parentRow), revision: next.revision + 1 }
        : next;
    });
}

/** Confirmed command updates only. New rows never splice into a scrolled window. */
export function settleCommentWindow(
  client: QueryClient,
  userId: string,
  postId: string,
  change:
    | { kind: 'add'; parentId: string | null }
    | { kind: 'edit'; id: string; body: string }
    | { kind: 'delete'; id: string },
) {
  client.setQueriesData<CommentWindow>(
    { predicate: (query) => ownedCommentWindow(query.queryKey, userId, postId) },
    (old) => {
      if (!old) return old;
      if (change.kind === 'add') {
        const marked = change.parentId
          ? patchCommentWindow(old, change.parentId, (row) => ({ ...row, has_replies: true }))
          : old;
        return { ...marked, headChanged: true, revision: marked.revision + 1 };
      }
      if (change.kind === 'delete' && old.scope.parentId === change.id)
        return { ...old, pages: [], parentRow: undefined, revision: old.revision + 1 };
      const update = (row: CommentPageRow) =>
        change.kind === 'delete' ? null : { ...row, body: change.body, body_edited: true };
      const next = patchCommentWindow(old, change.id, update);
      return old.parentRow?.id === change.id
        ? { ...next, parentRow: update(old.parentRow) ?? undefined, revision: next.revision + 1 }
        : next;
    },
  );
  void client.invalidateQueries(
    {
      predicate: (query) => ownedCommentWindow(query.queryKey, userId, postId),
      refetchType: 'active',
    },
    { cancelRefetch: false },
  );
}
