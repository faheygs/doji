import { submittedCommentRows } from '../../lib/submittedCommentRows';
import { inlineCommentRows } from '../../lib/inlineCommentPaging';
import { row } from '../fixtures/commentWindow';
import type { CommentSubmission } from '../../hooks/useCommentSubmission';

const submission = (id: string, parent: string | null = null): CommentSubmission => ({
  key: id,
  row: { ...row(id), parent_id: parent },
  state: 'sending',
  variables: {
    postId: 'post',
    body: id,
    parentId: parent,
    feedAudience: 'everyone',
    commandId: id,
  },
  account: { userId: 'self', isCurrent: () => true },
});
test('roots appear immediately without changing cursors; replies remain inline with no duplicates', () => {
  const roots = [row('root')];
  const existing = inlineCommentRows(roots, new Set(['root']), new Map());
  const ownRoot = submission('local'),
    ownReply = submission('reply', 'root');
  const result = submittedCommentRows(existing, [ownRoot, ownReply]);
  expect(result.filter((r) => r.kind === 'comment').map((r) => r.key)).toEqual([
    'submitted-local',
    'root',
    'submitted-reply',
  ]);
  expect(existing).toHaveLength(3);
  const received = inlineCommentRows([row('local'), ...roots], new Set(['root']), new Map());
  expect(
    submittedCommentRows(received, [{ ...ownRoot, state: 'confirmed' }]).filter(
      (r) => r.kind === 'comment' && r.comment.id === 'local',
    ),
  ).toHaveLength(1);
  expect(submittedCommentRows(existing, [{ ...ownRoot, state: 'rejected' }])).toEqual(existing);
  expect(submittedCommentRows(existing, [submission('missing-parent', 'not-loaded')])).toEqual(
    existing,
  );
});
