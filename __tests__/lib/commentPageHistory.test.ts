import { QueryClient } from '@tanstack/react-query';
import {
  acceptCommentPage,
  commentPageTicket,
  commentScopeKey,
  emptyCommentWindow,
  patchCommentWindow,
  reconcileCommentWindow,
  type CommentPage,
  type CommentWindow,
} from '../../lib/commentWindow';
import {
  cachedCommentPage,
  COMMENT_HISTORY_BYTES,
  COMMENT_HISTORY_MAX_AGE,
  COMMENT_HISTORY_PAGES,
  COMMENT_HISTORY_ROWS,
  rememberCommentEdge,
} from '../../lib/commentPageHistory';
import { restoreCommentPage, settleCommentWindow } from '../../lib/commentWindowCache';
import { cursor, row, scope } from '../fixtures/commentWindow';

const page = (n: number, count = 20): CommentPage => ({
  items: Array.from({ length: count }, (_, i) => row(String(n * count + i))),
  previous: n ? cursor(String(n * count)) : null,
  next: cursor(String(n * count + count - 1)),
  readAt: Date.now(),
});
const append = (window: CommentWindow, next: CommentPage) =>
  acceptCommentPage(
    window,
    commentPageTicket(window, 'next')!,
    next,
    new Set([window.pages.at(-1)?.items[0]?.id ?? 'initial']),
    3,
  ).window;
const visited = (count = 6) => {
  let window = emptyCommentWindow(scope);
  for (let n = 0; n < count; n++) window = append(window, page(n));
  return window;
};
let client: QueryClient;
beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(100_000);
  client = new QueryClient();
});
afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
});

test('backtracking over 120 roots restores all visited pages synchronously without changing freshness or generation', () => {
  const key = commentScopeKey(scope),
    initial = visited();
  client.setQueryData(key, initial, { updatedAt: 90_000 });
  for (let n = 2; n >= 0; n--) {
    const before = client.getQueryData<CommentWindow>(key)!;
    expect(
      restoreCommentPage(client, key, 'previous', new Set([before.pages[0].items[0].id]), 3),
    ).toBe(true);
    const after = client.getQueryData<CommentWindow>(key)!;
    expect(after.pages[0].items[0].id).toBe(String(n * 20));
    expect(after.generation).toBe(initial.generation);
    expect(client.getQueryState(key)?.dataUpdatedAt).toBe(90_000);
    expect(client.isFetching()).toBe(0);
  }
  expect(restoreCommentPage(client, key, 'previous', new Set(['0']), 3)).toBe(false);
  for (let n = 3; n < 6; n++) {
    const before = client.getQueryData<CommentWindow>(key)!;
    expect(
      restoreCommentPage(client, key, 'next', new Set([before.pages.at(-1)!.items[0].id]), 3),
    ).toBe(true);
    expect(client.getQueryData<CommentWindow>(key)!.pages.at(-1)!.items[0].id).toBe(String(n * 20));
  }
});

test('100K root traversal keeps active rows at 60 and recent history at 400, never the whole thread', () => {
  let window = emptyCommentWindow(scope);
  for (let n = 0; n < 5000; n++) {
    window = append(window, page(n));
    expect(window.pages.length).toBeLessThanOrEqual(3);
    expect(window.history?.length ?? 0).toBeLessThanOrEqual(COMMENT_HISTORY_PAGES);
    expect(
      window.history?.reduce((sum, e) => sum + e.page.items.length, 0) ?? 0,
    ).toBeLessThanOrEqual(COMMENT_HISTORY_ROWS);
  }
  expect(window.history).toHaveLength(20);
  expect(window.history![0].page.items[0].id).toBe('99540');
});

test('row and byte budgets independently evict the oldest entries', () => {
  let window = emptyCommentWindow(scope);
  for (let n = 0; n < 20; n++) window = append(window, page(n, 50));
  expect(window.history).toHaveLength(8);
  const oversized = page(20, 50);
  oversized.items[0].body = 'x'.repeat(COMMENT_HISTORY_BYTES);
  window = append(window, oversized);
  for (let n = 21; n < 24; n++) window = append(window, page(n, 50));
  expect(window.history).toBeUndefined();
});

test('read age is not renewed by scrolling, and clock rollback or missing timestamps cannot reuse a page', () => {
  const window = visited(),
    ticket = commentPageTicket(window, 'previous')!;
  expect(cachedCommentPage(window, ticket)).toBeDefined();
  jest.spyOn(Date, 'now').mockReturnValue(100_000 + COMMENT_HISTORY_MAX_AGE);
  expect(cachedCommentPage(window, ticket)).toBeUndefined();
  expect(rememberCommentEdge(window, window.pages, 'next')).toBeUndefined();
  jest.spyOn(Date, 'now').mockReturnValue(99_999);
  expect(cachedCommentPage(window, ticket)).toBeUndefined();
  const untimed = {
    ...window,
    history: window.history!.map((e) => ({ ...e, page: { ...e.page, readAt: undefined } })),
  };
  expect(cachedCommentPage(untimed, ticket)).toBeUndefined();
});

test('replies, unseen cursors, invalidation, errors, absent scopes and visible eviction edges never use cached pages', async () => {
  const window = visited(),
    key = commentScopeKey(scope),
    ticket = commentPageTicket(window, 'previous')!;
  expect(
    cachedCommentPage({ ...window, scope: { ...scope, parentId: 'parent' } }, ticket),
  ).toBeUndefined();
  expect(
    rememberCommentEdge(
      { ...window, scope: { ...scope, parentId: 'parent' } },
      window.pages,
      'next',
    ),
  ).toBeUndefined();
  expect(cachedCommentPage(window, { ...ticket, cursor: cursor('unseen') })).toBeUndefined();
  expect(restoreCommentPage(client, key, 'previous', new Set(['60']), 3)).toBe(false);
  client.setQueryData(key, window);
  expect(restoreCommentPage(client, key, 'previous', new Set(['100']), 3)).toBe(false);
  await client.invalidateQueries({ queryKey: key, refetchType: 'none' });
  expect(restoreCommentPage(client, key, 'previous', new Set(['60']), 3)).toBe(false);
  client.setQueryData(key, window);
  client.getQueryCache().find({ queryKey: key })!.setState({ status: 'error' });
  expect(restoreCommentPage(client, key, 'previous', new Set(['60']), 3)).toBe(false);
  for (const change of [
    { viewerId: 'other' },
    { audience: 'friends' as const },
    { postId: 'other' },
  ])
    expect(
      restoreCommentPage(
        client,
        commentScopeKey({ ...scope, ...change }),
        'previous',
        new Set(['60']),
        3,
      ),
    ).toBe(false);
});

test('reconciliation and confirmed changes discard history rather than resurrecting old hearts, edits or deletions', () => {
  const window = visited(),
    key = commentScopeKey(scope);
  expect(patchCommentWindow(window, '0', () => null).history).toBeUndefined();
  expect(reconcileCommentWindow(window, window, new Map()).history).toBeUndefined();
  for (const change of [
    { kind: 'add', parentId: null },
    { kind: 'edit', id: '0', body: 'new' },
    { kind: 'delete', id: '0' },
  ] as const) {
    client.setQueryData(key, window);
    settleCommentWindow(client, scope.viewerId, scope.postId, change);
    expect(client.getQueryData<CommentWindow>(key)?.history).toBeUndefined();
  }
});

test('duplicate reverse boundaries replace old cache entries without retaining overlapping restored rows', () => {
  const window = visited();
  window.history!.push(window.history![0]);
  const nextPages = [...window.pages.slice(1), page(6)];
  const entries = rememberCommentEdge(window, nextPages, 'next')!;
  const again = rememberCommentEdge({ ...window, history: entries }, nextPages, 'next')!;
  expect(again.filter((e) => e.cursor?.id === nextPages[0].previous?.id)).toHaveLength(1);
  expect(
    rememberCommentEdge(window, [window.history![0].page, ...window.pages], 'previous')?.some(
      (e) => e.page === window.history![0].page,
    ),
  ).toBe(false);
});
