import { QueryClient } from '@tanstack/react-query';
import { handleDomainRealtimeEvent } from '../../lib/domainRealtimeHandler';
import { refreshActivePostEngagement } from '../../lib/postEngagement';
import type { DojiRealtimeEvent } from '../../lib/realtimeClient';

const mockFetchProfile = jest.fn();
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: {
    getState: () => ({ fetchProfile: mockFetchProfile }),
  },
}));
jest.mock('../../lib/postEngagement', () => ({ refreshActivePostEngagement: jest.fn() }));

let client: QueryClient;
const invalidateRoots = jest.fn();
function emit(type: string, payload: Record<string, unknown> = {}) {
  handleDomainRealtimeEvent({
    event: { type, payload } as DojiRealtimeEvent,
    userId: 'member',
    queryClient: client,
    invalidateRoots,
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  jest.mocked(refreshActivePostEngagement).mockResolvedValue(undefined);
});
afterEach(() => client.clear());

test.each([
  [
    'doji.activated',
    ['upcomingDoji', 'userEvent', 'feed', 'post', 'profilePost', 'notificationCenter'],
  ],
  ['poll.vote.created', ['pollResults', 'pollVotersDetail']],
  ['poll.vote_like.created', ['pollVoteLikes', 'pollVotersDetail']],
  ['user_event.updated', ['userEvent', 'feed', 'profilePost']],
  ['shop.ownership.created', ['ownedShopItems']],
  ['account.profile.updated', ['profile']],
  [
    'social.friendship.accepted',
    [
      'friends',
      'friendRequests',
      'friendship',
      'friendCount',
      'profileFriends',
      'feed',
      'notificationCenter',
    ],
  ],
  ['social.block.created', ['blockedUsers', 'isBlocked', 'profile', 'profilePost', 'post', 'feed']],
  ['leaderboard.updated', ['leaderboard']],
  ['moderation.report.created', ['admin']],
  [
    'moderation.status.changed',
    [
      'moderationStatus',
      'notificationCenter',
      'feed',
      'post',
      'profile',
      'profilePost',
      'comments',
      'pollResults',
      'pollVotersDetail',
    ],
  ],
  ['post.created', ['feed', 'profilePost']],
  ['feed.post.updated', ['feed', 'post', 'profilePost']],
  ['feed.reaction.created', ['feed', 'reactions', 'post']],
  ['feed.comment_like.created', ['comments', 'commentLikes']],
  ['feed.comment.created', ['feed', 'comments', 'post']],
] as [string, string[]][])('%s reconciles only its authorized query families', (type, roots) => {
  emit(type);
  expect(invalidateRoots.mock.calls).toEqual([roots]);
  expect(mockFetchProfile.mock.calls).toEqual(
    /^(shop.ownership|account.profile)/.test(type) ? [['member']] : [],
  );
});

test.each([
  'profile.updated',
  'profile.presentation.updated',
  'profile.stats.updated',
  'badge.updated',
])('%s refreshes the member store only for that member', (type) => {
  for (const userId of ['other', 42, null, undefined]) emit(type, { userId });
  expect(mockFetchProfile).not.toHaveBeenCalled();
  emit(type, { userId: 'member' });
  expect(mockFetchProfile.mock.calls).toEqual([['member']]);
  expect(invalidateRoots).toHaveBeenCalledWith(
    ...(type === 'badge.updated'
      ? ['userBadges', 'userBadgeProgress', 'profile']
      : type === 'profile.stats.updated'
        ? ['profile', 'friends', 'leaderboard']
        : [
            'profile',
            'searchUsers',
            'friends',
            'friendRequests',
            'profileFriends',
            'pollVotersDetail',
            'leaderboard',
            'comments',
            'reactions',
            'notificationCenter',
            'feed',
          ]),
  );
});

test.each([
  ['notification.reaction.created', 'reactions', true],
  ['notification.comment.created', 'comments', true],
  ['notification.comment_reply.created', 'comments', true],
  ['notification.comment_like.created', 'comments', false],
] as [string, string, boolean][])(
  '%s targets the specific post without cancelling in-flight reads',
  (type, root, refresh) => {
    for (const queryKey of [
      [root, 'target'],
      [root, 'other'],
      ['unrelated', 'target'],
    ]) {
      client.setQueryData(queryKey, { count: 1 });
    }
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    emit(type, { postId: 'target' });
    expect(client.getQueryState([root, 'target'])?.isInvalidated).toBe(true);
    expect(client.getQueryState([root, 'other'])?.isInvalidated).toBe(false);
    expect(client.getQueryState(['unrelated', 'target'])?.isInvalidated).toBe(false);
    expect(invalidate).toHaveBeenCalledWith(
      { predicate: expect.any(Function), refetchType: 'active' },
      { cancelRefetch: false },
    );
    expect(refreshActivePostEngagement.mock.calls).toEqual(refresh ? [[client, 'target']] : []);
    expect(invalidateRoots).toHaveBeenCalledWith('notificationCenter');
  },
);

test.each([undefined, null, 123, ''])(
  'missing or malformed post ID %j cannot refresh another post',
  (postId) => {
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    emit('notification.reaction.created', { postId });
    expect(invalidate).not.toHaveBeenCalled();
    expect(refreshActivePostEngagement).not.toHaveBeenCalled();
  },
);

test.each([
  [
    'notification.friend_activity.created',
    ['notificationCenter', 'pollResults', 'pollVotersDetail', 'feed'],
  ],
  [
    'notification.suggestion.updated',
    ['notificationCenter', 'mySuggestions', 'challengeSuggestionCounts'],
  ],
  [
    'notification.badge.earned',
    ['notificationCenter', 'userBadges', 'userBadgeProgress', 'profile'],
  ],
  ['notification.other', ['notificationCenter']],
] as [string, string[]][])('%s reconciles notification-specific data', (type, roots) => {
  emit(type, { postId: 'target' });
  expect(invalidateRoots.mock.calls).toEqual([roots]);
  expect(refreshActivePostEngagement).not.toHaveBeenCalled();
});

test.each([true, false])(
  'failed engagement refresh is contained (development=%s)',
  async (development) => {
    const original = global.__DEV__;
    global.__DEV__ = development;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      jest.mocked(refreshActivePostEngagement).mockRejectedValue(new Error('offline'));
      emit('notification.reaction.created', { postId: 'target' });
      await Promise.resolve();
      expect(invalidateRoots).toHaveBeenCalledWith('notificationCenter');
      expect(warn).toHaveBeenCalledTimes(development ? 1 : 0);
    } finally {
      warn.mockRestore();
      global.__DEV__ = original;
    }
  },
);

test('unknown events do not cause a broad refresh', () => {
  emit('future.unknown');
  expect(invalidateRoots).not.toHaveBeenCalled();
  expect(mockFetchProfile).not.toHaveBeenCalled();
});
