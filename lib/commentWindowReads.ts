import { createRequestSignal } from './requestSignal';
import { readCommentPage, retainedCommentRows as retainedRows } from './commentPageReads';
import { preserveHeartRead } from './heartConsistency';
import { rpcQueryError } from './rpcQueryError';
import { visibleRootPages, reconcileRetainedRoots } from './retainedCommentRoots';
import type { QueryClient } from '@tanstack/react-query';
import {
  acceptCommentPage,
  commentPageTicket,
  commentScopeKey,
  emptyCommentWindow,
  reconcileCommentWindow,
  type CommentPageRow,
  type CommentScope,
  type CommentWindow,
} from './commentWindow';

export type CommentReadIntent = 'refresh' | 'visible' | 'latest' | 'next' | 'previous' | 'tail';
const denied = () =>
  Object.assign(new Error('This comment thread is no longer available.'), { code: '42501' });

/** One shared deadline covers the entire bounded refresh, not eight seconds per page. */
export async function readCommentWindow(options: {
  client: QueryClient;
  scope: CommentScope;
  intent: CommentReadIntent;
  signal: AbortSignal;
  visibleIds: () => ReadonlySet<string>;
  isCurrent: () => boolean;
  pageSize?: number;
  maxPages?: number;
  retainLoadedRoots?: boolean;
  canReplaceHead?: () => boolean;
}): Promise<CommentWindow> {
  const { client, scope, intent, visibleIds, isCurrent, pageSize = 50, maxPages = 5 } = options;
  if (
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 50 ||
    !Number.isInteger(maxPages) ||
    maxPages < 1 ||
    maxPages > 5
  )
    throw new Error('Invalid comment window budget');
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
      empty.retainLoadedRoots = !!options.retainLoadedRoots && !scope.parentId;
      const page = await readCommentPage(
        scope,
        {
          direction:
            scope.parentId && intent === 'latest' && prior?.pages.some((page) => page.items.length)
              ? 'previous'
              : 'next',
          cursor: null,
        },
        request.signal,
        pageSize,
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
        maxPages,
      ).window;
    } else if (intent === 'next' || intent === 'previous' || intent === 'tail') {
      // A previously complete reply tail can grow after a confirmed write/hint.
      // Read after its last retained ID, never replace the inline thread with a tail page.
      const last = prior.pages.at(-1)?.items.at(-1);
      const base =
        intent === 'tail' && scope.parentId && last
          ? {
              ...prior,
              pages: prior.pages.map((page, index) =>
                index === prior.pages.length - 1
                  ? {
                      ...page,
                      next: { id: last.id, createdAt: last.created_at },
                    }
                  : page,
              ),
            }
          : prior;
      const ticket = commentPageTicket(base, intent === 'previous' ? 'previous' : 'next');
      if (!ticket) {
        if (!isCurrent() || request.signal.aborted) throw new Error('Comment read cancelled');
        return prior;
      }
      const page = await readCommentPage(scope, ticket, request.signal, pageSize);
      const guarded = {
        ...page,
        items: preserveHeartRead(client, 'comment', scope.viewerId, key, startedAt, page.items),
      };
      if (intent === 'tail' && !guarded.items.length) {
        result = { ...prior, headChanged: false, revision: prior.revision + 1 };
      } else {
        const accepted = acceptCommentPage(base, ticket, guarded, visibleIds(), maxPages);
        result =
          accepted.status === 'accepted'
            ? { ...accepted.window, headChanged: intent === 'tail' ? false : prior.headChanged }
            : prior;
      }
    } else {
      const refreshed = new Map<string, CommentPageRow>();
      const selected = prior.retainLoadedRoots
        ? visibleRootPages(prior, visibleIds())
        : prior.pages;
      // Refresh visible root pages only, not the accumulated scrolling history.
      const ids = selected.flatMap((page) => page.items.map((row) => row.id));
      for (let offset = 0; offset < ids.length; offset += 50) {
        const rows = await retainedRows(scope, ids.slice(offset, offset + 50), request.signal);
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
      result = prior.retainLoadedRoots
        ? reconcileRetainedRoots(prior, selected, refreshed, intent !== 'visible')
        : reconcileCommentWindow(prior, prior, refreshed);
      const latest =
        intent === 'visible'
          ? null
          : await readCommentPage(
              scope,
              { direction: scope.parentId ? 'previous' : 'next', cursor: null },
              request.signal,
              1,
            );
      const latestId = latest?.items[0]?.id;
      result = {
        ...result,
        headChanged:
          intent === 'visible'
            ? prior.headChanged
            : !!latestId &&
              !result.pages.some((page) => page.items.some((row) => row.id === latestId)),
      };
    }
    if (!isCurrent() || request.signal.aborted) throw new Error('Comment read cancelled');
    const current = client.getQueryData<CommentWindow>(key);
    if (intent === 'latest' && !scope.parentId && options.canReplaceHead?.() === false)
      return current ?? initial;
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
