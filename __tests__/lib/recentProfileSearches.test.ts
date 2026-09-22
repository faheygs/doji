import {
  addRecentProfileSearch,
  normalizeRecentProfileSearches,
  type RecentProfileSearch,
} from '../../lib/recentProfileSearches';

function profile(id: string): RecentProfileSearch {
  return {
    id,
    username: `user_${id}`,
    display_name: `User ${id}`,
    avatar_url: null,
    avatar_gradient: ['#111111', '#222222'],
    equipped_border_key: null,
  };
}

describe('recentProfileSearches', () => {
  it('moves a selected profile to the front without duplicates', () => {
    expect(addRecentProfileSearch([profile('a'), profile('b')], profile('b')).map((p) => p.id))
      .toEqual(['b', 'a']);
  });

  it('keeps only ten recent profiles', () => {
    const current = Array.from({ length: 10 }, (_, index) => profile(String(index)));
    const result = addRecentProfileSearch(current, profile('new'));
    expect(result).toHaveLength(10);
    expect(result[0].id).toBe('new');
    expect(result.some((item) => item.id === '9')).toBe(false);
  });

  it('drops malformed and duplicate persisted entries', () => {
    expect(normalizeRecentProfileSearches([profile('a'), { id: 'bad' }, profile('a')]))
      .toEqual([profile('a')]);
  });
});
