import { supabase } from './supabase';
import { createRequestSignal, runAbortableQuery } from './requestSignal';
import { preserveHeartRead } from './heartConsistency';
import { rpcQueryError } from './rpcQueryError';
import type { QueryClient } from '@tanstack/react-query';
import {
  acceptCommentPage,
  commentPageTicket,
  commentScopeKey,
  emptyCommentWindow,
  reconcileCommentWindow,
  type CommentPage,
  type CommentPageRow,
  type CommentScope,
  type CommentWindow,
  type CommentPageRequest,
} from './commentWindow';

export type CommentReadIntent = 'refresh' | 'latest' | 'next' | 'previous';
const denied = () =>
  Object.assign(new Error('This comment thread is no longer available.'), { code: '42501' });

export async function readCommentPage(
  scope: CommentScope,
  request: CommentPageRequest,
  signal: AbortSignal,
  limit = 50,
): Promise<CommentPage> {
  const { data } = await runAbortableQuery(
    supabase.rpc('get_comment_page_v2', {
      p_post_id: scope.postId,
      p_audience: scope.audience,
      p_parent_id: scope.parentId,
      p_cursor_created_at: request.cursor?.createdAt ?? null,
      p_cursor_id: request.cursor?.id ?? null,
      p_direction: request.direction,
      p_limit: limit,
    }),
    signal,
  );
  const page = data as CommentPage | null;
  const validCursor = (cursor: unknown) =>
    cursor === null ||
    (!!cursor &&
      typeof cursor === 'object' &&
      typeof (cursor as { id?: unknown }).id === 'string' &&
      typeof (cursor as { createdAt?: unknown }).createdAt === 'string');
  if (
    !page ||
    !Array.isArray(page.items) ||
    page.items.length > limit ||
    !validCursor(page.next) ||
    !validCursor(page.previous) ||
    page.items.some(
      (row) =>
        !row ||
        typeof row.id !== 'string' ||
        row.post_id !== scope.postId ||
        row.parent_id !== scope.parentId,
    )
  )
    throw new Error('Invalid comment page response');
  return page;
}

async function retainedRows(
  scope: CommentScope,
  ids: string[],
  signal: AbortSignal,
): Promise<CommentPageRow[]> {
  const { data } = await runAbortableQuery(
    supabase.rpc('get_comment_rows_v2', {
      p_post_id: scope.postId,
      p_ids: ids,
      p_audience: scope.audience,
    }),
    signal,
  );
  if (
    !Array.isArray(data) ||
    data.length > 50 ||
    data.some((row) => !row || !ids.includes(row.id) || row.post_id !== scope.postId)
  )
    throw new Error('Invalid comment refresh response');
  return data as CommentPageRow[];
}

/** One shared deadline covers the entire bounded refresh, not eight seconds per page. */
export async function readCommentWindow(options: {
  client: QueryClient;
  scope: CommentScope;
  intent: CommentReadIntent;
  signal: AbortSignal;
  visibleIds: () => ReadonlySet<string>;
  isCurrent: () => boolean;
}): Promise<CommentWindow> {
  const { client, scope, intent, visibleIds, isCurrent } = options;
  const key = commentScopeKey(scope);
  const prior = client.getQueryData<CommentWindow>(key);
  const initial = prior ?? emptyCommentWindow(scope);
  const startedAt = Date.now();
  const request = createRequestSignal(options.signal);
  try {
    if (!isCurrent() || request.signal.aborted) throw new Error('Comment read cancelled');
    let parentRow: CommentPageRow | undefined;
    if (scope.parentId) {
      [parentRow] = await retainedRows(scope, [scope.parentId], request.signal);
      if (!parentRow || parentRow.parent_id !== null) throw denied();
      [parentRow] = preserveHeartRead(client, 'comment', scope.viewerId, key, startedAt, [
        parentRow,
      ]);
    }
    let result: CommentWindow;
    if (!prior || !prior.pages.length || intent === 'latest') {
      const empty = emptyCommentWindow(scope);
      const page = await readCommentPage(
        scope,
        {
          direction: scope.parentId && intent === 'latest' ? 'previous' : 'next',
          cursor: null,
        },
        request.signal,
      );
      const guarded = {
        ...page,
        items: preserveHeartRead(client, 'comment', scope.viewerId, key, startedAt, page.items),
      };
      result = acceptCommentPage(
        empty,
        commentPageTicket(empty, 'next')!,
        guarded,
        new Set(),
      ).window;
    } else if (intent === 'next' || intent === 'previous') {
      const ticket = commentPageTicket(prior, intent);
      if (!ticket) {
        if (!isCurrent() || request.signal.aborted) throw new Error('Comment read cancelled');
        return prior;
      }
      const page = await readCommentPage(scope, ticket, request.signal);
      const guarded = {
        ...page,
        items: preserveHeartRead(client, 'comment', scope.viewerId, key, startedAt, page.items),
      };
      result = acceptCommentPage(prior, ticket, guarded, visibleIds()).window;
    } else {
      const refreshed = new Map<string, CommentPageRow>();
      // At most five batches, sequential and cancellable; never refetch visited/evicted pages.
      for (const page of prior.pages) {
        if (!page.items.length) continue;
        const rows = await retainedRows(
          scope,
          page.items.map((row) => row.id),
          request.signal,
        );
        for (const row of preserveHeartRead(
          client,
          'comment',
          scope.viewerId,
          key,
          startedAt,
          rows,
        ))
          refreshed.set(row.id, row);
      }
      result = reconcileCommentWindow(prior, prior, refreshed);
      const latest = await readCommentPage(
        scope,
        { direction: scope.parentId ? 'previous' : 'next', cursor: null },
        request.signal,
        1,
      );
      const latestId = latest.items[0]?.id;
      result = {
        ...result,
        headChanged:
          prior.headChanged ||
          (!!latestId &&
            !result.pages.some((page) => page.items.some((row) => row.id === latestId))),
      };
    }
    if (!isCurrent() || request.signal.aborted) throw new Error('Comment read cancelled');
    const current = client.getQueryData<CommentWindow>(key);
    if (current && current.generation !== initial.generation) return current;
    if (current && current.revision !== initial.revision) {
      if (intent !== 'refresh') return current;
      // Keep newer local fields, but never keep an identity omitted by an authorized refresh.
      const allowed = new Set(result.pages.flatMap((page) => page.items.map((row) => row.id)));
      return {
        ...current,
        pages: current.pages.map((page) => ({
          ...page,
          items: page.items.filter((row) => allowed.has(row.id)),
        })),
        headChanged: current.headChanged || result.headChanged,
        revision: current.revision + 1,
      };
    }
    return { ...result, parentRow };
  } catch (error) {
    // Child requests see this shared deadline as parent cancellation. Preserve
    // timeout semantics so a transient timeout does not purge authorized rows.
    throw request.abortSource === 'deadline'
      ? rpcQueryError(error, { abortSource: 'deadline', timeoutMs: 8_000 })
      : error;
  } finally {
    request.cleanup();
  }
}
