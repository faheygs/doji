import {
  emptyCommentWindow,
  type CommentPageRow,
  type CommentScope,
  type CommentWindow,
} from '../../lib/commentWindow';

export const scope: CommentScope = {
  postId: 'post',
  viewerId: 'me',
  audience: 'everyone',
  parentId: null,
};
export const cursor = (id: string) => ({ id, createdAt: '2026-11-09T00:00:00Z' });
export const row = (id: string, parent_id: string | null = null): CommentPageRow => ({
  id,
  parent_id,
  post_id: 'post',
  user_id: 'author',
  reply_to_comment_id: null,
  body: `Synthetic ${id}`,
  created_at: cursor(id).createdAt,
  updated_at: cursor(id).createdAt,
  body_edited: false,
  like_count: 0,
  my_like: false,
  has_replies: false,
});
export const page = (ids: string[], parentId: string | null = null) => ({
  items: ids.map((id) => row(id, parentId)),
  previous: null,
  next: cursor(ids.at(-1) ?? 'end'),
});
export const windowData = (ids = ['one', 'two'], owner = scope): CommentWindow => ({
  ...emptyCommentWindow(owner),
  pages: [page(ids, owner.parentId)],
  revision: 1,
});
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
