import type { CommentPageRow, CommentWindow } from './commentWindow';
import { canKeepQueryDataOnError } from './queryDisplayState';

// Bound the whole expanded tree, not just each individual cursor. At most 60
// roots and 30 replies per retained root: 1,860 list records regardless of thread
// size, plus at most 60 parent snapshots used to reauthorize expanded threads.
export const INLINE_ROOT_BUDGET = { pageSize: 20, maxPages: 3 } as const;
export const INLINE_REPLY_BUDGET = { pageSize: 10, maxPages: 3 } as const;
export const INLINE_COMMENT_RECORD_LIMIT = 60 * 31;
export type InlineWindowState = {
  data?: CommentWindow;
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  isLoading: boolean;
};
export type InlineCommentRow =
  | { key: string; kind: 'comment'; rootId: string; comment: CommentPageRow; reply: boolean }
  | { key: string; kind: 'toggle'; rootId: string; expanded: boolean }
  | { key: string; kind: 'status'; rootId: string; state?: InlineWindowState };

export function readableCommentRows(
  state?: Pick<InlineWindowState, 'data' | 'isError' | 'error'>,
): CommentPageRow[] {
  return state?.isError && !canKeepQueryDataOnError(state.data, state.error)
    ? []
    : (state?.data?.pages.flatMap((page) => page.items) ?? []);
}

export function inlineCommentRows(
  roots: CommentPageRow[],
  expanded: ReadonlySet<string>,
  replies: ReadonlyMap<string, InlineWindowState>,
): InlineCommentRow[] {
  return roots.flatMap((root) => {
    const rows: InlineCommentRow[] = [
      { key: root.id, kind: 'comment', rootId: root.id, comment: root, reply: false },
    ];
    if (root.has_replies || expanded.has(root.id)) {
      rows.push({
        key: `toggle-${root.id}`,
        kind: 'toggle',
        rootId: root.id,
        expanded: expanded.has(root.id),
      });
      if (expanded.has(root.id)) {
        rows.push(
          ...readableCommentRows(replies.get(root.id)).map((comment) => ({
            key: comment.id,
            kind: 'comment' as const,
            rootId: root.id,
            comment,
            reply: true,
          })),
        );
        rows.push({
          key: `status-${root.id}`,
          kind: 'status',
          rootId: root.id,
          state: replies.get(root.id),
        });
      }
    }
    return rows;
  });
}

/** A visible reply pins its parent against root-window eviction as well. */
export function commentViewport(rows: readonly InlineCommentRow[]) {
  const roots = new Set<string>(),
    replies = new Map<string, Set<string>>();
  for (const row of rows) {
    roots.add(row.rootId);
    if (row.kind === 'comment' && row.reply) {
      const ids = replies.get(row.rootId) ?? new Set<string>();
      ids.add(row.comment.id);
      replies.set(row.rootId, ids);
    }
  }
  return { roots, replies };
}
