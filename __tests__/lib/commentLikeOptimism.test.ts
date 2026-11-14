import { heartState } from '../../lib/heartConsistency';
import type { CommentWithMeta } from '../../hooks/useComments';

const comment = (overrides: Partial<CommentWithMeta> = {}) =>
  ({ id: 'comment-1', my_like: false, like_count: 2, ...overrides }) as CommentWithMeta;

describe('shared heart state preserves comment optimism', () => {
  it('shows a new heart immediately', () => {
    expect(heartState(comment(), true)).toMatchObject({
      my_like: true,
      like_count: 3,
    });
  });

  it('removes a heart without allowing a negative count', () => {
    expect(
      heartState(comment({ my_like: true, like_count: 0 }), false),
    ).toMatchObject({ my_like: false, like_count: 0 });
  });

  it('accepts the authoritative server count', () => {
    expect(heartState(comment(), true, 9).like_count).toBe(9);
  });
});
