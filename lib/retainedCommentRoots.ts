import type { CommentPage, CommentPageRow, CommentWindow } from './commentWindow';

/** Loaded roots stay in the list; a refresh must not fan out across every page
 * the member has visited. Offscreen pages reconcile when they become visible. */
export function visibleRootPages(window: CommentWindow, visible: ReadonlySet<string>) {
  const pages = window.pages.filter((page) => page.items.some((row) => visible.has(row.id)));
  return (pages.length ? pages : window.pages).slice(0, 3);
}

export function reconcileRetainedRoots(
  window: CommentWindow,
  selected: readonly CommentPage[],
  rows: ReadonlyMap<string, CommentPageRow>,
  invalidateOthers: boolean,
): CommentWindow {
  return {
    ...window,
    revision: window.revision + 1,
    pages: window.pages.map((page) =>
      selected.includes(page)
        ? {
            ...page,
            needsRefresh: false,
            items: page.items.flatMap((prior) => {
              const row = rows.get(prior.id);
              if (!row) return [];
              if (row.post_id !== window.scope.postId || row.parent_id !== null)
                throw new Error('Invalid root reconciliation');
              return [row];
            }),
          }
        : invalidateOthers
          ? { ...page, needsRefresh: true }
          : page,
    ),
  };
}
