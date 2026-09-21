import { stabilizeFeedPosts } from '../../lib/stableFeed';
import type { Post } from '../../types/database';

const post = (id: string) => ({ id } as Post);

describe('stabilizeFeedPosts', () => {
  it('shows realtime inserts immediately while the viewer is at the top', () => {
    const result = stabilizeFeedPosts([post('new'), post('a'), post('b')], ['a', 'b'], false);
    expect(result.posts.map((item) => item.id)).toEqual(['new', 'a', 'b']);
    expect(result.withheldIds).toEqual([]);
  });

  it('withholds only rows inserted above a scrolled viewport', () => {
    const result = stabilizeFeedPosts(
      [post('new-2'), post('new-1'), post('a'), post('b'), post('older')],
      ['a', 'b'],
      true,
    );
    expect(result.posts.map((item) => item.id)).toEqual(['a', 'b', 'older']);
    expect(result.withheldIds).toEqual(['new-2', 'new-1']);
  });

  it('never preserves a row removed by the authoritative feed', () => {
    const result = stabilizeFeedPosts(
      [post('new'), post('a')],
      ['removed-by-block', 'a'],
      true,
    );
    expect(result.posts.map((item) => item.id)).toEqual(['a']);
    expect(result.withheldIds).toEqual(['new']);
  });
});
