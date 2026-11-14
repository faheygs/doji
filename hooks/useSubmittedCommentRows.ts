import { useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import {
  inlineCommentRows,
  readableCommentRows,
  type InlineWindowState,
} from '../lib/inlineCommentPaging';
import { submittedCommentRows } from '../lib/submittedCommentRows';
import type { CommentPageRow } from '../lib/commentWindow';
import type { CommentSubmission } from './useCommentSubmission';

/** Keep actor feedback separate from cursor pages, retaining its native row key. */
export function useSubmittedCommentRows(
  roots: CommentPageRow[],
  expanded: ReadonlySet<string>,
  replies: ReadonlyMap<string, InlineWindowState>,
  submissions: CommentSubmission[],
  setExpanded: Dispatch<SetStateAction<ReadonlySet<string>>>,
  onObserved?: (ids: ReadonlySet<string>) => void,
) {
  const keys = useRef(new Map<string, string>());
  useEffect(() => {
    const parents = submissions.flatMap((entry) =>
      entry.row.parent_id && roots.some((root) => root.id === entry.row.parent_id)
        ? [entry.row.parent_id]
        : [],
    );
    if (parents.length)
      setExpanded((old) =>
        parents.every((id) => old.has(id)) ? old : new Set([...old, ...parents]),
      );
  }, [submissions, roots, setExpanded]);
  useEffect(() => {
    onObserved?.(
      new Set(
        [...roots, ...[...replies.values()].flatMap((state) => readableCommentRows(state))].map(
          (row) => row.id,
        ),
      ),
    );
  }, [roots, replies, onObserved]);
  return useMemo(() => {
    for (const entry of submissions)
      if (entry.state === 'confirmed') keys.current.set(entry.row.id, `submitted-${entry.key}`);
    return submittedCommentRows(inlineCommentRows(roots, expanded, replies), submissions).map(
      (row) =>
        row.kind === 'comment' && keys.current.has(row.comment.id)
          ? { ...row, key: keys.current.get(row.comment.id)! }
          : row,
    );
  }, [roots, expanded, replies, submissions]);
}
