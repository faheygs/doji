import {
  addRecentProfileSearch,
  addRecentSearchQuery,
  normalizeSearchQuery,
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
  it('normalizes, deduplicates and bounds query history alongside legacy profiles', () => {
    const saved = addRecentSearchQuery([profile('a')], '  Alex   Johnson  ');
    expect(saved).toEqual([
      { id: 'query:alex johnson', kind: 'query', query: 'Alex Johnson' },
      profile('a'),
    ]);
    expect(addRecentSearchQuery(saved, 'alex johnson')).toHaveLength(2);
    expect(addRecentSearchQuery(saved, ' x ')).toEqual(saved);
    expect(normalizeSearchQuery('a'.repeat(200))).toHaveLength(100);
    const many = Array.from({ length: 10 }, (_, i) => profile(String(i)));
    expect(addRecentSearchQuery(many, 'Smith')).toHaveLength(10);
    expect(
      normalizeRecentProfileSearches([
        ...saved,
        { kind: 'query', query: 'ALEX JOHNSON', id: 'untrusted' },
        { kind: 'query', query: 'x' },
        { kind: 'query', query: 12 },
        null,
      ]),
    ).toEqual(saved);
    expect(normalizeRecentProfileSearches(null)).toEqual([]);
    expect(normalizeRecentProfileSearches(many.concat(profile('overflow')))).toHaveLength(10);
  });
  it('moves a selected profile to the front without duplicates', () => {
    expect(
      addRecentProfileSearch([profile('a'), profile('b')], profile('b')).map((p) => p.id),
    ).toEqual(['b', 'a']);
  });

  it('keeps only ten recent profiles', () => {
    const current = Array.from({ length: 10 }, (_, index) => profile(String(index)));
    const result = addRecentProfileSearch(current, profile('new'));
    expect(result).toHaveLength(10);
    expect(result[0].id).toBe('new');
    expect(result.some((item) => item.id === '9')).toBe(false);
  });

  it('drops malformed and duplicate persisted entries', () => {
    expect(normalizeRecentProfileSearches([profile('a'), { id: 'bad' }, profile('a')])).toEqual([
      profile('a'),
    ]);
  });
});
