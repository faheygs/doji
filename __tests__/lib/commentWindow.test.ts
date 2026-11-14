import {
  acceptCommentPage,
  commentPageTicket,
  commentScopeKey,
  emptyCommentWindow,
  patchCommentWindow,
  reconcileCommentWindow,
  COMMENT_WINDOW_PAGES,
  type CommentPage,
  type CommentPageRow,
  type CommentScope,
  type CommentWindow,
} from '../../lib/commentWindow';

const scope: CommentScope = {
  postId: 'post',
  viewerId: 'viewer',
  audience: 'everyone',
  parentId: null,
};
const cursor = (n: number) => ({ id: `c${n}`, createdAt: '2026-11-09T00:00:00Z' });
const row = (n: number): CommentPageRow => ({
  id: `c${n}`,
  post_id: 'post',
  user_id: 'author',
  parent_id: null,
  reply_to_comment_id: null,
  body: `Synthetic ${n}`,
  created_at: cursor(n).createdAt,
  updated_at: cursor(n).createdAt,
  body_edited: false,
  like_count: 0,
  my_like: false,
  has_replies: false,
});
const page = (n: number, total = 2000): CommentPage => ({
  items: Array.from({ length: 50 }, (_, offset) => row(n * 50 + offset)),
  previous: n > 0 ? cursor(n * 50) : null,
  next: n < total - 1 ? cursor(n * 50 + 49) : null,
});
const append = (window: CommentWindow, n: number) =>
  acceptCommentPage(
    window,
    commentPageTicket(window, 'next')!,
    page(n),
    new Set([window.pages.at(-1)?.items[0]?.id ?? 'initial']),
  ).window;

it('walks all 100K identities forward and backward while retaining at most 250 rows', () => {
  let window = emptyCommentWindow(scope);
  let traversed = 0;
  for (let n = 0; n < 2000; n++) {
    window = append(window, n);
    traversed += 50;
    expect(window.pages.length).toBeLessThanOrEqual(COMMENT_WINDOW_PAGES);
    expect(window.pages.at(-1)?.items.at(-1)?.id).toBe(`c${n * 50 + 49}`);
  }
  expect(traversed).toBe(100000);
  expect(commentPageTicket(window, 'next')).toBeNull();
  for (let n = 1994; n >= 0; n--) {
    window = acceptCommentPage(
      window,
      commentPageTicket(window, 'previous')!,
      page(n),
      new Set([window.pages[0].items[0].id]),
    ).window;
    expect(window.pages).toHaveLength(5);
    expect(window.pages[0].items[0].id).toBe(`c${n * 50}`);
  }
  expect(commentPageTicket(window, 'previous')).toBeNull();
});

it('defers eviction while that edge contains any visible row, retaining the exact anchor object', () => {
  let window = emptyCommentWindow(scope);
  for (let n = 0; n < 5; n++) window = append(window, n);
  const ticket = commentPageTicket(window, 'next')!;
  const anchor = window.pages[0].items[30];
  const deferred = acceptCommentPage(window, ticket, page(5), new Set([anchor.id]));
  expect(deferred).toEqual({ window, status: 'deferred', removedIds: [] });
  expect(acceptCommentPage(window, ticket, page(5), new Set()).status).toBe('deferred');
  const accepted = acceptCommentPage(window, ticket, page(5), new Set(['c80']));
  expect(accepted.status).toBe('accepted');
  expect(accepted.removedIds).toHaveLength(50);
  expect(accepted.window.pages[0].items[30]).toBe(window.pages[1].items[30]);
  expect(
    acceptCommentPage(
      accepted.window,
      commentPageTicket(accepted.window, 'previous')!,
      page(0),
      new Set(['c299']),
    ).status,
  ).toBe('deferred');
});

it('fences late responses across account, audience, parent, post and revision changes', () => {
  const empty = emptyCommentWindow(scope);
  expect(commentPageTicket(empty, 'previous')).toBeNull();
  const ticket = commentPageTicket(empty, 'next')!;
  expect(acceptCommentPage(emptyCommentWindow(scope), ticket, page(0), new Set()).status).toBe(
    'stale',
  );
  for (const change of [
    { viewerId: 'other' },
    { audience: 'friends' as const },
    { parentId: 'root' },
    { postId: 'other' },
  ]) {
    expect(
      acceptCommentPage(emptyCommentWindow({ ...scope, ...change }), ticket, page(0), new Set())
        .status,
    ).toBe('stale');
  }
  const filled = append(empty, 0);
  expect(acceptCommentPage(filled, ticket, page(0), new Set()).status).toBe('stale');
  const wrong = { ...commentPageTicket(filled, 'next')!, cursor: cursor(900) };
  expect(acceptCommentPage(filled, wrong, page(1), new Set()).status).toBe('stale');
  expect(commentScopeKey(scope)).toEqual(['commentWindow', 'post', 'viewer', 'everyone', null]);
});

it('rejects unbounded, duplicate or wrong-scope rows and deduplicates adjacent page overlap', () => {
  const empty = emptyCommentWindow(scope),
    ticket = commentPageTicket(empty, 'next')!;
  const accept = (value: CommentPage) => acceptCommentPage(empty, ticket, value, new Set());
  expect(() => accept({ ...page(0), items: Array.from({ length: 51 }, (_, n) => row(n)) })).toThrow(
    'bound',
  );
  expect(() => accept({ ...page(0), items: [row(1), row(1)] })).toThrow('identity');
  expect(() => accept({ ...page(0), items: [{ ...row(1), parent_id: 'other' }] })).toThrow('scope');
  const filled = append(empty, 0);
  const overlap = { ...page(1), items: [row(49), ...page(1).items.slice(1)] };
  expect(
    acceptCommentPage(filled, commentPageTicket(filled, 'next')!, overlap, new Set()).window
      .pages[1].items,
  ).toHaveLength(49);
});

it('reconciles retained identities without adding or reordering rows, including authorization removals', () => {
  const window = append(emptyCommentWindow(scope), 0);
  const changed = { ...row(3), body: 'Updated' };
  const incoming = new Map(window.pages[0].items.map((value) => [value.id, value]));
  incoming.set('c3', changed);
  incoming.set('new', { ...row(1000), id: 'new' });
  incoming.delete('c4');
  const next = reconcileCommentWindow(window, window, incoming);
  expect(next.pages[0].items).toHaveLength(49);
  expect(next.pages[0].items[3]).toBe(changed);
  expect(next.pages[0].items[0]).toBe(window.pages[0].items[0]);
  expect(next.pages[0].items.some((value) => value.id === 'new')).toBe(false);
  expect(reconcileCommentWindow(next, window, incoming)).toBe(next);
  expect(reconcileCommentWindow(window, emptyCommentWindow(scope), incoming)).toBe(window);
});

it('patches just one identity without restoring unrelated data or resurrecting an evicted record', () => {
  const window = append(append(emptyCommentWindow(scope), 0), 1);
  const patched = patchCommentWindow(window, 'c1', (value) => ({
    ...value,
    my_like: true,
    like_count: 1,
  }));
  expect(patched.pages[1]).toBe(window.pages[1]);
  expect(patched.pages[0].items[0]).toBe(window.pages[0].items[0]);
  expect(patched.pages[0].items[1].my_like).toBe(true);
  expect(patchCommentWindow(window, 'c1', (value) => value)).toBe(window);
  expect(patchCommentWindow(window, 'missing', () => row(0))).toBe(window);
  expect(patchCommentWindow(window, 'c1', () => null).pages[0].items).toHaveLength(49);
  expect(() => patchCommentWindow(window, 'c1', (value) => ({ ...value, id: 'changed' }))).toThrow(
    'identity',
  );
});
