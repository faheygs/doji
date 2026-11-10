import type { CommentPage, CommentPageRequest, CommentWindow } from './commentWindow';

export const COMMENT_HISTORY_PAGES = 20;
export const COMMENT_HISTORY_ROWS = 400;
export const COMMENT_HISTORY_BYTES = 2 * 1024 * 1024;
export const COMMENT_HISTORY_MAX_AGE = 120_000;
export type CommentHistoryEntry = CommentPageRequest & { page: CommentPage; bytes: number };

const requestKey = (request: CommentPageRequest) =>
  JSON.stringify([request.direction, request.cursor?.createdAt, request.cursor?.id]);
const fresh = (page: CommentPage, now: number) =>
  page.readAt !== undefined && now >= page.readAt && now - page.readAt < COMMENT_HISTORY_MAX_AGE;

/** An account/window-owned backtrack cache, not another rendered list or persisted store.
 * Read timestamps survive reuse: scrolling cannot renew server authorization age. */
export function cachedCommentPage(window: CommentWindow, request: CommentPageRequest) {
  if (window.scope.parentId) return undefined;
  return window.history?.find(
    (entry) => requestKey(entry) === requestKey(request) && fresh(entry.page, Date.now()),
  )?.page;
}

export function rememberCommentEdge(
  window: CommentWindow,
  pages: CommentPage[],
  direction: CommentPageRequest['direction'],
): CommentHistoryEntry[] | undefined {
  if (window.scope.parentId) return undefined;
  const now = Date.now();
  const retained = new Set(pages.flatMap((page) => page.items.map((row) => row.id)));
  // Remove restored/expired entries; LRU order reflects last departure from the window.
  const entries = (window.history ?? []).filter(
    (entry) => !entry.page.items.some((row) => retained.has(row.id)) && fresh(entry.page, now),
  );
  const evicted = window.pages.find((page) => !pages.includes(page));
  const cursor = direction === 'next' ? pages[0]?.previous : pages.at(-1)?.next;
  if (evicted?.items.length && cursor && fresh(evicted, now)) {
    const request = { direction: direction === 'next' ? 'previous' : 'next', cursor } as const;
    const duplicate = entries.findIndex((entry) => requestKey(entry) === requestKey(request));
    if (duplicate >= 0) entries.splice(duplicate, 1);
    entries.push({ ...request, page: evicted, bytes: JSON.stringify(evicted).length * 2 });
  }
  let rows = entries.reduce((sum, entry) => sum + entry.page.items.length, 0);
  let bytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  while (
    entries.length > COMMENT_HISTORY_PAGES ||
    rows > COMMENT_HISTORY_ROWS ||
    bytes > COMMENT_HISTORY_BYTES
  ) {
    const removed = entries.shift()!;
    rows -= removed.page.items.length;
    bytes -= removed.bytes;
  }
  return entries.length ? entries : undefined;
}
