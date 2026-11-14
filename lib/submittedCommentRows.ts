import type { InlineCommentRow } from './inlineCommentPaging';
import type { CommentSubmission } from '../hooks/useCommentSubmission';

/** Local sends never enter server cursors or displace any retained page. */
export function submittedCommentRows(
  rows: InlineCommentRow[],
  submissions: CommentSubmission[],
): InlineCommentRow[] {
  const seen = new Set(rows.flatMap((row) => (row.kind === 'comment' ? [row.comment.id] : [])));
  const local = submissions.filter(
    (entry) => entry.state !== 'rejected' && !seen.has(entry.row.id),
  );
  const asRow = (entry: CommentSubmission): InlineCommentRow => ({
    key: `submitted-${entry.key}`,
    kind: 'comment',
    rootId: entry.row.parent_id ?? entry.row.id,
    comment: { ...entry.row, has_replies: false, reply_count: 0 },
    reply: !!entry.row.parent_id,
  });
  return [
    ...local
      .filter((entry) => !entry.row.parent_id)
      .reverse()
      .map(asRow),
    ...rows.flatMap((row) =>
      row.kind === 'status'
        ? [...local.filter((entry) => entry.row.parent_id === row.rootId).map(asRow), row]
        : [row],
    ),
  ];
}
