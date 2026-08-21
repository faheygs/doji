import type { CommentWithMeta } from '../hooks/useComments';
import { parseDate } from '../utils/time';

export type CommentThreadRow =
  | { kind: 'root'; comment: CommentWithMeta; replyCount: number }
  | { kind: 'reply'; comment: CommentWithMeta; parentUsername?: string }
  | { kind: 'toggle'; parentId: string; replyCount: number; expanded: boolean };

export function buildCommentRows(
  comments: CommentWithMeta[],
  expandedComments: Set<string>,
): CommentThreadRow[] {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const byParent = new Map<string | null, CommentWithMeta[]>();
  for (const comment of comments) {
    const parentId = comment.parent_id;
    const siblings = byParent.get(parentId) ?? [];
    siblings.push(comment);
    byParent.set(parentId, siblings);
  }
  const sortByTime = (a: CommentWithMeta, b: CommentWithMeta) =>
    parseDate(a.created_at).getTime() - parseDate(b.created_at).getTime();
  const rows: CommentThreadRow[] = [];
  for (const root of (byParent.get(null) ?? []).slice().sort(sortByTime)) {
    const replies = (byParent.get(root.id) ?? []).slice().sort(sortByTime);
    rows.push({ kind: 'root', comment: root, replyCount: replies.length });
    if (replies.length === 0) continue;
    const expanded = expandedComments.has(root.id);
    rows.push({ kind: 'toggle', parentId: root.id, replyCount: replies.length, expanded });
    if (!expanded) continue;
    for (const reply of replies) {
      const parent = reply.parent_id ? byId.get(reply.parent_id) : undefined;
      rows.push({ kind: 'reply', comment: reply, parentUsername: parent?.profile?.username });
    }
  }
  return rows;
}

export function replyRootId(comment: Pick<CommentWithMeta, 'id' | 'parent_id'>): string {
  return comment.parent_id ?? comment.id;
}
