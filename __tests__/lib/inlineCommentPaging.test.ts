import { acceptCommentPage, commentPageTicket, emptyCommentWindow } from '../../lib/commentWindow';
import {
  INLINE_COMMENT_RECORD_LIMIT,
  INLINE_ROOT_BUDGET,
  INLINE_REPLY_BUDGET,
  commentViewport,
  inlineCommentRows,
} from '../../lib/inlineCommentPaging';
import { cursor, page, row, scope, windowData } from '../fixtures/commentWindow';

test('100K-root traversal stays within the inline budget without losing either cursor direction', () => {
  let current = emptyCommentWindow(scope);
  for (let offset = 0; offset < 100_000; offset += INLINE_ROOT_BUDGET.pageSize) {
    const ids = Array.from({ length: INLINE_ROOT_BUDGET.pageSize }, (_, n) => String(offset + n));
    const ticket = commentPageTicket(current, 'next')!;
    const result = acceptCommentPage(
      current,
      ticket,
      {
        ...page(ids),
        previous: offset ? cursor(ids[0]) : null,
        next: offset + 20 < 100_000 ? cursor(ids.at(-1)!) : null,
      },
      new Set(current.pages.at(-1)?.items.map((item) => item.id) ?? []),
      INLINE_ROOT_BUDGET.maxPages,
    );
    expect(result.status).toBe('accepted');
    current = result.window;
    expect(current.pages.flatMap((p) => p.items).length).toBeLessThanOrEqual(60);
  }
  expect(commentPageTicket(current, 'next')).toBeNull();
  expect(commentPageTicket(current, 'previous')).not.toBeNull();
  const previous = acceptCommentPage(
    current,
    commentPageTicket(current, 'previous')!,
    {
      ...page(Array.from({ length: 20 }, (_, n) => String(99_920 + n))),
      previous: cursor('99920'),
    },
    new Set(current.pages[0].items.map((item) => item.id)),
    INLINE_ROOT_BUDGET.maxPages,
  );
  expect(previous.status).toBe('accepted');
  expect(previous.window.pages).toHaveLength(3);
});

test('even all retained roots expanded cannot grow with the total comment count', () => {
  const roots = Array.from({ length: 60 }, (_, i) => ({ ...row(`root-${i}`), has_replies: true }));
  const expanded = new Set(roots.map((item) => item.id));
  const replies = new Map(
    roots.map((root) => [
      root.id,
      {
        data: {
          ...windowData([], { ...scope, parentId: root.id }),
          pages: Array.from({ length: INLINE_REPLY_BUDGET.maxPages }, (_, p) =>
            page(
              Array.from(
                { length: INLINE_REPLY_BUDGET.pageSize },
                (_, r) => `${root.id}-${p}-${r}`,
              ),
              root.id,
            ),
          ),
        },
        isError: false,
        error: null,
        isFetching: false,
        isLoading: false,
      },
    ]),
  );
  const flattened = inlineCommentRows(roots, expanded, replies);
  expect(flattened.filter((item) => item.kind === 'comment')).toHaveLength(
    INLINE_COMMENT_RECORD_LIMIT,
  );
  const keys = flattened.map((item) => item.key);
  expect(new Set(keys).size).toBe(keys.length);
  const viewport = commentViewport(flattened.filter((item) => item.key === 'root-25-2-5'));
  expect([...viewport.roots]).toEqual(['root-25']);
  expect([...viewport.replies.get('root-25')!]).toEqual(['root-25-2-5']);
});
