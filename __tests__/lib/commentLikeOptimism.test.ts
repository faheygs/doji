import { patchCommentLike } from '../../lib/commentLikeOptimism';
import type { CommentWithMeta } from '../../hooks/useComments';

const comment = (overrides: Partial<CommentWithMeta> = {}) =>
  ({ id: 'comment-1', my_like: false, like_count: 2, ...overrides }) as CommentWithMeta;

describe('patchCommentLike', () => {
  it('shows a new heart immediately', () => {
    expect(patchCommentLike([comment()], 'comment-1', true)[0]).toMatchObject({
      my_like: true,
      like_count: 3,
    });
  });

  it('removes a heart without allowing a negative count', () => {
    expect(
      patchCommentLike([comment({ my_like: true, like_count: 0 })], 'comment-1', false)[0],
    ).toMatchObject({ my_like: false, like_count: 0 });
  });

  it('accepts the authoritative server count', () => {
    expect(patchCommentLike([comment()], 'comment-1', true, 9)[0].like_count).toBe(9);
  });
});
