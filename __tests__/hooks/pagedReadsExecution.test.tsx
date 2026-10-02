import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InteractionManager } from 'react-native';
import { useFriendsPaged } from '../../hooks/useFriendsPaged';
import { useProfileFriendsPaged } from '../../hooks/useProfileFriendsPaged';
import { useComments, useMentionSearch, prefetchCommentsForPost } from '../../hooks/useComments';
import { useCommentLikes } from '../../hooks/useCommentLikes';
import {
  useFeed,
  usePostReactions,
  prefetchFeedAudience,
  prefetchPostReactions,
} from '../../hooks/useFeed';
import { useLeaderboard, warmLeaderboardCache } from '../../hooks/useLeaderboard';

const mockRead = jest.fn();
const mockRpc = jest.fn();
const mockFeedRead = jest.fn();
let mockUser: string | undefined = 'viewer';
jest.mock('../../lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({ session: mockUser ? { user: { id: mockUser } } : null }),
}));
jest.mock('../../lib/feedQueries', () => ({
  ...jest.requireActual('../../lib/feedQueries'),
  fetchFeedPostsPage: (...args: unknown[]) => mockFeedRead(...args),
}));
let client: QueryClient;
function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  notifyManager.setScheduler((callback) => callback());
  jest.clearAllMocks();
  mockUser = 'viewer';
  mockRead.mockReset().mockResolvedValue({ data: [], error: null });
  mockFeedRead.mockReset().mockResolvedValue([]);
  mockRpc.mockReset().mockImplementation(() => ({
    retry: jest.fn(),
    abortSignal: (signal: AbortSignal) => mockRead(signal),
  }));
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
});
afterEach(() => {
  cleanup();
  client.clear();
  jest.restoreAllMocks();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
});
const rows = (size: number) =>
  Array.from({ length: size }, (_, i) => ({
    id: `row-${i}`,
    friend_id: `friend-${i}`,
    friendship_id: `friendship-${i}`,
    accepted_at: '2026-10-01T00:00:00Z',
    created_at: '2026-10-01T00:00:00Z',
    username: `person_${i}`,
    display_name: `Person ${i}`,
    avatar_gradient: ['#111111', '#222222'],
    avatar_url: null,
    equipped_border_key: null,
    current_streak: 2,
  }));
const paged = [
  [
    'friends',
    useFriendsPaged,
    'list_my_friends_page',
    50,
    { p_before_accepted_at: '2026-10-01T00:00:00Z', p_before_id: 'friendship-49' },
  ],
  [
    'profile friends',
    () => useProfileFriendsPaged('owner'),
    'list_profile_friends_page',
    50,
    { p_after_friend_id: 'friend-49' },
  ],
  [
    'comments',
    () => useComments('post'),
    'get_comment_thread_snapshot',
    50,
    { p_before_created_at: '2026-10-01T00:00:00Z', p_before_id: 'row-49' },
  ],
  [
    'comment likes',
    () => useCommentLikes('comment'),
    'get_comment_like_voters_page',
    30,
    { p_before_created_at: '2026-10-01T00:00:00Z', p_before_id: 'row-29' },
  ],
  [
    'reactions',
    () => usePostReactions('post'),
    'get_post_reaction_voters_page',
    50,
    { p_before_created_at: '2026-10-01T00:00:00Z', p_before_id: 'row-49' },
  ],
] as const;
for (const [name, hook, rpc, size, cursor] of paged) {
  test.each([null, [], rows(1)])(
    `${name}: missing or short data ends pagination (%j)`,
    async (data) => {
      mockRead.mockResolvedValue({ data, error: null });
      const { result } = renderHook(() => hook(), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.pages[0]).toHaveLength(data?.length ?? 0);
      expect(result.current.hasNextPage).toBe(false);
      expect(mockRpc).toHaveBeenCalledWith(rpc, expect.objectContaining({ p_limit: size }));
    },
  );
  test(`${name}: full pages use the exact server cursor and stop after an empty page`, async () => {
    mockRead
      .mockResolvedValueOnce({ data: rows(size), error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    const { result } = renderHook(() => hook(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await act(async () => {
      await result.current.fetchNextPage();
    });
    expect(mockRpc).toHaveBeenLastCalledWith(rpc, expect.objectContaining(cursor));
    expect(result.current.hasNextPage).toBe(false);
    expect(result.current.data?.pages).toHaveLength(2);
  });
  test(`${name}: failed page retains the loaded page and exposes retry`, async () => {
    mockRead.mockResolvedValueOnce({ data: rows(size), error: null }).mockResolvedValueOnce({
      data: null,
      error: { message: 'page unavailable', code: 'XX000' },
      status: 503,
    });
    // Subscribe to the error state as a screen rendering its retry affordance does.
    const { result } = renderHook(
      () => {
        const query = hook();
        void query.isFetchNextPageError;
        return query;
      },
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.isFetchNextPageError).toBe(true));
    expect(result.current.data?.pages[0]).toHaveLength(size);
    mockRead.mockResolvedValue({ data: [], error: null });
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.isFetchNextPageError).toBe(false));
    expect(result.current.hasNextPage).toBe(false);
  });
}
test.each([null, [], ['#111'], ['#111', '#222'], 'invalid'])(
  'profile friends use safe avatar fallbacks (%j)',
  async (avatar_gradient) => {
    mockRead.mockResolvedValue({
      data: [
        { ...rows(1)[0], avatar_gradient, avatar_url: undefined, equipped_border_key: undefined },
      ],
      error: null,
    });
    const { result } = renderHook(() => useProfileFriendsPaged('owner'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const friend = result.current.data?.pages[0][0];
    expect(friend?.avatar_url).toBeNull();
    expect(friend?.equipped_border_key).toBeNull();
    expect(friend?.avatar_gradient).toHaveLength(2);
    if (Array.isArray(avatar_gradient) && avatar_gradient.length === 2)
      expect(friend?.avatar_gradient).toEqual(avatar_gradient);
  },
);
test('a full friend page without an accepted timestamp never invents a cursor', async () => {
  mockRead.mockResolvedValue({
    data: rows(50).map((row) => ({ ...row, accepted_at: null })),
    error: null,
  });
  const { result } = renderHook(useFriendsPaged, { wrapper: Wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.hasNextPage).toBe(false);
});
test.each([
  ['friends', () => useFriendsPaged()],
  ['profile missing', () => useProfileFriendsPaged(undefined)],
  ['profile disabled', () => useProfileFriendsPaged('owner', false)],
  ['comments disabled', () => useComments('post', { fetchEnabled: false })],
  ['comment likes disabled', () => useCommentLikes('comment', false)],
  ['reactions', () => usePostReactions('post')],
] as const)('%s respects access and enable guards', async (_name, hook) => {
  mockUser = undefined;
  const { result } = renderHook(() => hook(), { wrapper: Wrapper });
  expect(result.current.fetchStatus).toBe('idle');
  expect(mockRpc).not.toHaveBeenCalled();
});
test.each([useFriendsPaged, () => useProfileFriendsPaged(undefined)])(
  'manual refresh without the required identity remains empty',
  async (hook) => {
    mockUser = undefined;
    const { result } = renderHook(() => hook(), { wrapper: Wrapper });
    await act(async () => {
      expect((await result.current.refetch()).data?.pages[0]).toEqual([]);
    });
    expect(mockRpc).not.toHaveBeenCalled();
  },
);
test.each([null, rows(1)])('mention search trims input and stays bounded (%j)', async (data) => {
  mockRead.mockResolvedValue({ data, error: null });
  const { result } = renderHook(() => useMentionSearch('  person  '), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual(data ?? []);
  expect(mockRpc).toHaveBeenCalledWith('search_mentionable_profiles', {
    p_query: 'person',
    p_limit: 8,
  });
});
test('signed-out mention refresh returns no identities without a request', async () => {
  mockUser = undefined;
  const { result } = renderHook(() => useMentionSearch('person'), { wrapper: Wrapper });
  await act(async () => {
    expect((await result.current.refetch()).data).toEqual([]);
  });
  expect(mockRpc).not.toHaveBeenCalled();
});
test.each([true, false])(
  'feed keeps full/locked cache keys separate (unlocked=%s)',
  async (unlocked) => {
    const { result } = renderHook(() => useFeed('everyone', unlocked, 'event'), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFeedRead).toHaveBeenCalledWith(
      { userId: 'viewer', dailyEventId: 'event', audience: 'everyone', unlocked },
      { offset: 0 },
      expect.any(AbortSignal),
    );
    expect(
      client.getQueryData(['feed', 'event', 'everyone', 'viewer', unlocked ? 'full' : 'locked']),
    ).toBeDefined();
  },
);
test.each([
  ['viewer', undefined],
  [undefined, 'event'],
] as const)('manual feed refresh with user=%s event=%s never fetches', async (user, eventId) => {
  mockUser = user;
  const { result } = renderHook(() => useFeed('friends', true, eventId), { wrapper: Wrapper });
  await act(async () => {
    expect((await result.current.refetch()).data?.pages[0]).toEqual([]);
  });
  expect(mockFeedRead).not.toHaveBeenCalled();
});
test('default feed is disabled until the participation state is known', () => {
  const { result } = renderHook(() => useFeed(), { wrapper: Wrapper });
  expect(result.current.fetchStatus).toBe('idle');
  expect(mockFeedRead).not.toHaveBeenCalled();
});
test('feed prefetch warms only the specified member/audience/event key', async () => {
  await prefetchFeedAudience(client, {
    userId: 'viewer',
    dailyEventId: 'event',
    audience: 'friends',
    unlocked: true,
  });
  expect(client.getQueryData(['feed', 'event', 'friends', 'viewer', 'full'])).toMatchObject({
    pages: [[]],
  });
  expect(mockFeedRead).toHaveBeenCalledTimes(1);
});
test.each([prefetchCommentsForPost, prefetchPostReactions])(
  'engagement prefetch retains its exact viewer key and empty fallback',
  async (prefetch) => {
    mockRead.mockResolvedValue({ data: null, error: null });
    await prefetch(client, { postId: 'post', userId: 'viewer', audience: 'friends' });
    expect(mockRpc).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ p_post_id: 'post', p_audience: 'friends', p_limit: 50 }),
    );
    expect(client.getQueryCache().getAll()[0].state.data).toMatchObject({ pages: [[]] });
  },
);
test.each(['weekly', 'alltime'] as const)(
  'leaderboard %s reads are bounded and not retried invisibly',
  async (mode) => {
    mockRead.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useLeaderboard(mode, 'everyone'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(mockRpc).toHaveBeenCalledWith('get_leaderboard_snapshot', {
      p_mode: mode,
      p_audience: 'everyone',
      p_limit: 50,
    });
  },
);
test('signed-out friends leaderboard is disabled even when manually refreshed', async () => {
  mockUser = undefined;
  const { result } = renderHook(() => useLeaderboard('weekly', 'friends'), { wrapper: Wrapper });
  await act(async () => {
    expect((await result.current.refetch()).data).toEqual([]);
  });
  expect(mockRpc).not.toHaveBeenCalled();
});
test('warming all four variants requires a member', async () => {
  warmLeaderboardCache(client, undefined);
  expect(mockRpc).not.toHaveBeenCalled();
  warmLeaderboardCache(client, 'viewer');
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(mockRpc).toHaveBeenCalledTimes(4);
  expect(mockRpc.mock.calls.map((call) => [call[1].p_mode, call[1].p_audience])).toEqual([
    ['weekly', 'friends'],
    ['weekly', 'everyone'],
    ['alltime', 'friends'],
    ['alltime', 'everyone'],
  ]);
});
test('loaded leaderboard defers warming until interactions finish and cancels on unmount', async () => {
  let callback: (() => void) | undefined;
  const cancel = jest.fn();
  jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((task) => {
    callback = typeof task === 'function' ? task : undefined;
    return { cancel, then: jest.fn(), done: jest.fn() } as ReturnType<
      typeof InteractionManager.runAfterInteractions
    >;
  });
  mockRead.mockResolvedValue({ data: [{ id: 'viewer' }], error: null });
  const { result, unmount } = renderHook(() => useLeaderboard(), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.data).toHaveLength(1));
  expect(callback).toBeDefined();
  await act(async () => {
    callback?.();
  });
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(mockRpc).toHaveBeenCalledTimes(4);
  unmount();
  expect(cancel).toHaveBeenCalledTimes(1);
});
