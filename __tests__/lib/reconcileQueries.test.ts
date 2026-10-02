import { QueryClient } from '@tanstack/react-query';

const roots = [
  'upcomingDoji',
  'userEvent',
  'feed',
  'pollResults',
  'pollVotersDetail',
  'pollVotesCount',
  'myPollVote',
  'pollVoteLikes',
  'profile',
  'profilePost',
  'searchUsers',
  'friends',
  'friendRequests',
  'friendship',
  'friendCount',
  'profileFriends',
  'blockedUsers',
  'isBlocked',
  'leaderboard',
  'userBadges',
  'userBadgeProgress',
  'ownedShopItems',
  'reactionsGiven',
  'reactions',
  'comments',
  'commentLikes',
  'post',
  'mySuggestions',
  'challengeSuggestionCounts',
  'notificationCenter',
  'moderationStatus',
];
let reconcile: typeof import('../../lib/reconcileQueries').reconcileAppQueries;
let client: QueryClient;
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-01T12:00:00Z'));
  // Each test gets its own module-owned coalescing state, just as a fresh app runtime.
  jest.isolateModules(() => {
    reconcile = require('../../lib/reconcileQueries').reconcileAppQueries;
  });
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
});
afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
  jest.useRealTimers();
});
test.each([true, false])(
  'reconciles server-owned cache with admin scope=%s and no cancelled requests',
  async (isAdmin) => {
    for (const root of [...roots, 'admin', 'localDraft', 123])
      client.setQueryData([root, 'member'], 'cached');
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    await reconcile(client, { userId: 'member', isAdmin });
    for (const root of roots)
      expect(client.getQueryState([root, 'member'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['admin', 'member'])?.isInvalidated).toBe(isAdmin);
    expect(client.getQueryState(['localDraft', 'member'])?.isInvalidated).toBe(false);
    expect(client.getQueryState([123, 'member'])?.isInvalidated).toBe(false);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith(
      { predicate: expect.any(Function), refetchType: 'active' },
      { cancelRefetch: false },
    );
  },
);
test('default call never invalidates admin data', async () => {
  client.setQueryData(['admin'], 'cached');
  await reconcile(client);
  expect(client.getQueryState(['admin'])?.isInvalidated).toBe(false);
});
test('concurrent recovery shares one invalidation and releases after completion', async () => {
  let finish!: () => void;
  const invalidate = jest.spyOn(client, 'invalidateQueries').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const first = reconcile(client);
  const second = reconcile(client, { force: true });
  expect(second).toBe(first);
  expect(invalidate).toHaveBeenCalledTimes(1);
  finish();
  await first;
  await reconcile(client, { force: true });
  expect(invalidate).toHaveBeenCalledTimes(2);
});
test('coalesces completed calls for 1500ms; explicit forced recovery bypasses that window', async () => {
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  await reconcile(client);
  await reconcile(client);
  jest.advanceTimersByTime(1499);
  await reconcile(client);
  expect(invalidate).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(1);
  await reconcile(client);
  expect(invalidate).toHaveBeenCalledTimes(2);
  await reconcile(client, { force: true });
  expect(invalidate).toHaveBeenCalledTimes(3);
});
test('a rejected invalidation does not poison later recovery', async () => {
  const invalidate = jest
    .spyOn(client, 'invalidateQueries')
    .mockRejectedValueOnce(new Error('offline'));
  await expect(reconcile(client)).rejects.toThrow('offline');
  jest.advanceTimersByTime(1500);
  await reconcile(client);
  expect(invalidate).toHaveBeenCalledTimes(2);
});
