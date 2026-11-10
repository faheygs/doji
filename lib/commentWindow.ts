import type { Comment } from '../types/database';
import type { FeedAudience } from './feedAudience';

export const COMMENT_PAGE_SIZE = 50;
export const COMMENT_WINDOW_PAGES = 5;
export type CommentCursor = { createdAt: string; id: string };
export type CommentPageRow = Comment & { has_replies: boolean };
export type CommentPage = {
  items: CommentPageRow[];
  previous: CommentCursor | null;
  next: CommentCursor | null;
};
export type CommentScope = {
  postId: string;
  viewerId: string;
  audience: FeedAudience;
  parentId: string | null;
};
export type CommentPageRequest = {
  direction: 'next' | 'previous';
  cursor: CommentCursor | null;
};
export type CommentWindow = {
  scope: CommentScope;
  pages: CommentPage[];
  /** Memory-only mount/account generation; returning to the same viewer is not reuse. */
  generation: symbol;
  /** Changes after every accepted update, fencing a stale page/refetch response. */
  revision: number;
};
export type CommentPageTicket = CommentPageRequest & {
  scope: CommentScope;
  generation: symbol;
  revision: number;
};

export const commentScopeKey = (scope: CommentScope) =>
  ['commentWindow', scope.postId, scope.viewerId, scope.audience, scope.parentId] as const;
const sameScope = (a: CommentScope, b: CommentScope) =>
  a.postId === b.postId &&
  a.viewerId === b.viewerId &&
  a.audience === b.audience &&
  a.parentId === b.parentId;
const sameCursor = (a: CommentCursor | null, b: CommentCursor | null) =>
  a === b || (!!a && !!b && a.id === b.id && a.createdAt === b.createdAt);

export function emptyCommentWindow(scope: CommentScope): CommentWindow {
  return { scope, pages: [], generation: Symbol('comment-window'), revision: 0 };
}

/** A single-flight caller owns the request. This token prevents stale completions
 * after scope changes, reconciliation, mutations or another accepted page. */
export function commentPageTicket(
  window: CommentWindow,
  direction: 'next' | 'previous',
): CommentPageTicket | null {
  const cursor = direction === 'next' ? window.pages.at(-1)?.next : window.pages[0]?.previous;
  if (window.pages.length && !cursor) return null;
  if (!window.pages.length && direction === 'previous') return null;
  return {
    scope: window.scope,
    generation: window.generation,
    revision: window.revision,
    direction,
    cursor: cursor ?? null,
  };
}

function validatePage(scope: CommentScope, page: CommentPage) {
  if (page.items.length > COMMENT_PAGE_SIZE) throw new Error('Comment page exceeded its bound');
  const ids = new Set<string>();
  for (const row of page.items) {
    if (row.post_id !== scope.postId || row.parent_id !== scope.parentId || ids.has(row.id))
      throw new Error('Comment page scope or identity mismatch');
    ids.add(row.id);
  }
}

/** Never discard a visible row to honor a memory limit. Defer the page instead;
 * the native adapter must retry when the viewport leaves that eviction edge. */
export function acceptCommentPage(
  window: CommentWindow,
  ticket: CommentPageTicket,
  page: CommentPage,
  visibleIds: ReadonlySet<string>,
): { window: CommentWindow; status: 'accepted' | 'stale' | 'deferred'; removedIds: string[] } {
  const expected = commentPageTicket(window, ticket.direction);
  if (
    !expected ||
    window.generation !== ticket.generation ||
    !sameScope(window.scope, ticket.scope) ||
    window.revision !== ticket.revision ||
    !sameCursor(expected.cursor, ticket.cursor)
  )
    return { window, status: 'stale', removedIds: [] };
  validatePage(window.scope, page);
  const existing = new Set(window.pages.flatMap((current) => current.items.map((row) => row.id)));
  const unique = { ...page, items: page.items.filter((row) => !existing.has(row.id)) };
  const pages = ticket.direction === 'next' ? [...window.pages, unique] : [unique, ...window.pages];
  let removedIds: string[] = [];
  if (pages.length > COMMENT_WINDOW_PAGES) {
    const edge = ticket.direction === 'next' ? pages[0] : pages.at(-1)!;
    if (visibleIds.size === 0 || edge.items.some((row) => visibleIds.has(row.id)))
      return { window, status: 'deferred', removedIds: [] };
    removedIds = edge.items.map((row) => row.id);
    if (ticket.direction === 'next') pages.shift();
    else pages.pop();
  }
  return {
    window: { ...window, pages, revision: window.revision + 1 },
    status: 'accepted',
    removedIds,
  };
}

/** Retained-ID reconciliation changes existing rows only, in their current order.
 * Missing authorized results remove rows; new rows wait for explicit head refresh.
 * The caller must discard the entire result if any page fails authorization. */
export function reconcileCommentWindow(
  window: CommentWindow,
  captured: Pick<CommentWindow, 'revision' | 'generation'>,
  refreshed: ReadonlyMap<string, CommentPageRow>,
): CommentWindow {
  if (window.generation !== captured.generation || window.revision !== captured.revision)
    return window;
  const pages = window.pages.map((page) => ({
    ...page,
    items: page.items.flatMap((prior) => {
      const row = refreshed.get(prior.id);
      if (!row) return [];
      validatePage(window.scope, { items: [row], previous: null, next: null });
      return [row];
    }),
  }));
  return { ...window, pages, revision: window.revision + 1 };
}

/** Target only the matching identity; unrelated row objects retain their identity. */
export function patchCommentWindow(
  window: CommentWindow,
  id: string,
  update: (row: CommentPageRow) => CommentPageRow | null,
): CommentWindow {
  let changed = false;
  const pages = window.pages.map((page) => {
    let pageChanged = false;
    const items = page.items.flatMap((row) => {
      if (row.id !== id) return [row];
      const next = update(row);
      if (next) {
        validatePage(window.scope, { items: [next], previous: null, next: null });
        if (next.id !== id) throw new Error('Comment identity cannot change');
      }
      pageChanged ||= next !== row;
      return next ? [next] : [];
    });
    changed ||= pageChanged;
    return pageChanged ? { ...page, items } : page;
  });
  return changed ? { ...window, pages, revision: window.revision + 1 } : window;
}
