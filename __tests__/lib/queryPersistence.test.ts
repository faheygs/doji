import { isPersistedQueryKey, sanitizePersistedQueryData } from '../../lib/queryPersistence';

describe('query persistence policy', () => {
  it('covers bounded social surfaces but excludes ephemeral search and admin state', () => {
    for (const root of [
      'comments',
      'commentLikes',
      'reactions',
      'leaderboard',
      'profile',
      'friends',
      'userBadges',
    ]) {
      expect(isPersistedQueryKey([root])).toBe(true);
    }
    expect(isPersistedQueryKey(['searchUsers', 'ki'])).toBe(false);
    expect(isPersistedQueryKey(['mentionSearch', 'ki'])).toBe(false);
    expect(isPersistedQueryKey(['admin', 'reports'])).toBe(false);
  });

  it('keeps only the first infinite page and strips nested signed bearer URLs', () => {
    const result = sanitizePersistedQueryData({
      pages: [
        [{ id: 'one', photo_url: 'https://x/storage/v1/object/sign/post-media/a.jpg?t=1' }],
        [{ id: 'two', photo_url: 'stable' }],
      ],
      pageParams: [null, { offset: 50 }],
      nested: { avatar_url: 'https://cdn.example/avatar.jpg' },
    });

    expect(result).toEqual({
      pages: [[{ id: 'one', photo_url: null }]],
      pageParams: [null],
      nested: { avatar_url: 'https://cdn.example/avatar.jpg' },
    });
  });
});
