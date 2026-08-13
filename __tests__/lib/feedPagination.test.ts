import { FEED_PAGE_SIZE, nextFeedPage } from '../../lib/feedQueries';
import type { Post } from '../../types/database';

const post = (id: string, createdAt: string) => ({ id, created_at: createdAt }) as Post;

describe('feed keyset pagination', () => {
  it('uses the final stable timestamp/id pair instead of a growing offset scan', () => {
    const page = Array.from({ length: FEED_PAGE_SIZE }, (_, index) =>
      post(`post-${index}`, `2026-08-12T12:00:${String(index).padStart(2, '0')}Z`));

    expect(nextFeedPage(page, [page], { offset: 0 })).toEqual({
      offset: FEED_PAGE_SIZE,
      beforeCreatedAt: page[FEED_PAGE_SIZE - 1].created_at,
      beforeId: page[FEED_PAGE_SIZE - 1].id,
    });
  });

  it('stops when the server returns a short page', () => {
    expect(nextFeedPage([post('one', '2026-08-12T12:00:00Z')], [], { offset: 0 }))
      .toBeUndefined();
  });
});
