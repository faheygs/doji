import { QueryCache, QueryClient, useQuery, useInfiniteQuery, type FetchQueryOptions } from '@tanstack/react-query';
import { useUserEvent } from '../../hooks/useUserEvent';
import { useAppUpdatePolicy } from '../../hooks/useAppUpdatePolicy';
import { useLeaderboard } from '../../hooks/useLeaderboard';
import { useFriendsPaged } from '../../hooks/useFriendsPaged';
import { useUserBadgeProgress, useBadgeDefinitions, useUserBadges, useBadgeCategories, useBadgeTiers } from '../../hooks/useBadges';
import { useMySuggestions, usePendingSuggestions } from '../../hooks/useSuggestions';
import { useOwnedShopItems, useShopCatalog } from '../../hooks/useShop';
import { useComments, useMentionSearch, prefetchCommentsForPost } from '../../hooks/useComments';
import { useFriendship, usePost, useFriendCount, useSearchUsers } from '../../hooks/useProfile';
import { useCurrentProfilePost } from '../../hooks/useCurrentProfilePost';
import { useFriendRequests, useFriendRequestCount } from '../../hooks/useFriendRequests';
import { useBlockedUsersPaged, useBlockedUserCount, useIsBlockedByMe } from '../../hooks/useBlockUser';
import { useProfileFriendsPaged } from '../../hooks/useProfileFriendsPaged';
import { usePollVotesCount } from '../../hooks/usePollVotesCount';
import { useModerationStatus } from '../../hooks/useModerationStatus';
import { useCommentLikes } from '../../hooks/useCommentLikes';
import { usePendingReports } from '../../hooks/useReports';
import { useChallengeSuggestionCounts } from '../../hooks/useChallengeSuggestionCounts';
import { usePostReactions, prefetchPostReactions } from '../../hooks/useFeed';
import { useReactionsGivenCount } from '../../hooks/useReactionsGivenCount';
import { syncServerClock } from '../../lib/serverClock';
import { shouldRetryQuery } from '../../lib/apiRetry';

const mockRead = jest.fn();
const mockRpc = jest.fn().mockImplementation(() => ({ abortSignal: mockRead }));
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockLimit = jest.fn();
const mockOrder = jest.fn();
const mockChain: any = {
  select: (...args: unknown[]) => { mockSelect(...args); return mockChain; },
  eq: (...args: unknown[]) => { mockEq(...args); return mockChain; },
  limit: (...args: unknown[]) => { mockLimit(...args); return mockChain; },
  order: (...args: unknown[]) => { mockOrder(...args); return mockChain; },
  or: () => mockChain, not: () => mockChain, retry: () => mockChain,
  abortSignal: (...args: unknown[]) => {
    const result = mockRead(...args);
    return Object.assign(result, { maybeSingle: () => result });
  },
};
jest.mock('../../lib/supabase', () => ({ supabase: {
  rpc: (...args: unknown[]) => mockRpc(...args),
  from: () => mockChain,
} }));
jest.mock('react', () => ({ ...jest.requireActual('react'), useEffect: jest.fn() }));
jest.mock('@tanstack/react-query', () => ({ ...jest.requireActual('@tanstack/react-query'),
  useQuery: jest.fn(options => options), useInfiniteQuery: jest.fn(options => options),
  useQueryClient: () => ({}),
}));
jest.mock('../../stores/useAuthStore', () => ({ useAuthStore: (select: any) => select({ session: { user: { id: 'member' } } }) }));
jest.mock('../../utils/upload', () => ({}));
jest.mock('../../lib/contentFilter', () => ({}));
jest.mock('../../lib/dojiWriteReceipt', () => ({}));
jest.mock('../../lib/commandGateway', () => ({}));
jest.mock('../../lib/feedQueries', () => ({}));
jest.mock('../../hooks/useToggleReaction', () => ({}));
jest.mock('../../lib/serverClock', () => ({ syncServerClock: jest.fn() }));
jest.mock('@sentry/react-native', () => ({ init: jest.fn() }));

const cases = [
  ['user event', useUserEvent, 6000],
  ['release policy', () => useAppUpdatePolicy(true), 6000],
  ['leaderboard', () => useLeaderboard(), 6000],
  ['friends', useFriendsPaged, 8000],
  ['badge progress', () => useUserBadgeProgress('member'), 8000],
  ['my suggestions', () => useMySuggestions('member'), 8000],
  ['owned shop items', () => useOwnedShopItems('member'), 8000],
  ['reactions', () => usePostReactions('post', 'friends'), 8000],
  ['reactions given', () => useReactionsGivenCount('member'), 8000],
  ['comments', () => useComments('post'), 8000],
  ['mentions', () => useMentionSearch('test'), 8000],
  ['friendship', () => useFriendship('friend'), 8000],
  ['post detail', () => usePost('post'), 8000],
  ['profile post', () => useCurrentProfilePost('member'), 8000],
  ['friend count', () => useFriendCount('member'), 8000],
  ['search users', () => useSearchUsers('test'), 8000],
  ['friend requests', useFriendRequests, 8000],
  ['friend request count', useFriendRequestCount, 8000],
  ['blocked users', useBlockedUsersPaged, 8000],
  ['blocked user count', useBlockedUserCount, 8000],
  ['block status', () => useIsBlockedByMe('friend'), 8000],
  ['profile friends', () => useProfileFriendsPaged('member'), 8000],
  ['poll vote count', () => usePollVotesCount('member'), 8000],
  ['moderation status', useModerationStatus, 8000],
  ['comment likes', () => useCommentLikes('comment'), 8000],
  ['badges', useBadgeDefinitions, 8000],
  ['user badges', () => useUserBadges('member'), 8000],
  ['badge categories', useBadgeCategories, 8000],
  ['badge tiers', useBadgeTiers, 8000],
  ['shop catalog', useShopCatalog, 8000],
  ['legacy pending suggestions', usePendingSuggestions, 8000],
  ['legacy pending reports', usePendingReports, 8000],
] as const;
function optionsFor(hook: () => unknown): FetchQueryOptions {
  hook();
  return ((useQuery as jest.Mock).mock.calls.at(-1) ?? (useInfiniteQuery as jest.Mock).mock.calls.at(-1))[0];
}
let client: QueryClient;
let onError: jest.Mock;
beforeEach(() => {
  jest.clearAllMocks();
  onError = jest.fn();
  client = new QueryClient({ queryCache: new QueryCache({ onError }),
    defaultOptions: { queries: { retry: shouldRetryQuery, retryDelay: 1, gcTime: 0 } } });
});
afterEach(() => { client.clear(); jest.useRealTimers(); });

test.each(cases)('%s retains a terminal HTTP failure and retries only once', async (_name, hook) => {
  mockRead.mockResolvedValue({ data: null, error: { message: 'unavailable' }, status: 503 });
  await expect(client.fetchQuery(optionsFor(hook))).rejects.toMatchObject({ status: 503, abortSource: 'none' });
  expect(mockRead).toHaveBeenCalledTimes(2);
  expect(onError).toHaveBeenCalledTimes(1);
});

test.each(cases)('%s recovers from a wrapped native deadline with one retry', async (_name, hook, deadline) => {
  jest.useFakeTimers();
  mockRead.mockImplementationOnce((signal: AbortSignal) => new Promise(resolve => {
    signal.addEventListener('abort', () => resolve({ data: null, error: { message: 'AbortError: Aborted', code: '' }, status: 0 }));
  })).mockResolvedValue({ data: null, error: null, status: 200 });
  const pending = client.fetchQuery(optionsFor(hook));
  await jest.advanceTimersByTimeAsync(deadline + 10);
  await pending;
  expect(mockRead).toHaveBeenCalledTimes(2);
  expect(onError).not.toHaveBeenCalled();
});

test.each(cases)('%s cancels without a retry or incident', async (_name, hook) => {
  mockRead.mockImplementation((signal: AbortSignal) => new Promise(resolve => {
    signal.addEventListener('abort', () => resolve({ data: null, error: { message: 'AbortError: Aborted' }, status: 0 }));
  }));
  const options = optionsFor(hook);
  const pending = client.fetchQuery(options).catch(() => null);
  await client.cancelQueries({ queryKey: options.queryKey });
  await pending;
  expect(mockRead).toHaveBeenCalledTimes(1);
  expect(onError).not.toHaveBeenCalled();
});

test.each(cases)('%s fails closed on permissions without retrying', async (_name, hook) => {
  mockRead.mockResolvedValue({ data: null, error: { code: '42501', message: 'denied' }, status: 403 });
  await expect(client.fetchQuery(optionsFor(hook))).rejects.toMatchObject({ status: 403, code: '42501' });
  expect(mockRead).toHaveBeenCalledTimes(1);
});

test('both suggestion count reads retain status and count bounds', async () => {
  mockRead.mockResolvedValue({ data: null, count: 7, error: null, status: 200 });
  expect(await client.fetchQuery(optionsFor(() => useChallengeSuggestionCounts('member')))).toEqual({ submitted: 7, picked: 7 });
  expect(mockRead).toHaveBeenCalledTimes(2);
  expect(mockSelect).toHaveBeenCalledWith('id', { count: 'exact', head: true });
  mockRead.mockClear();
  mockRead.mockResolvedValue({ data: null, error: { code: '42501', message: 'denied' }, status: 403 });
  await expect(client.fetchQuery(optionsFor(() => useChallengeSuggestionCounts('other')))).rejects.toMatchObject({ status: 403 });
  expect(mockRead).toHaveBeenCalledTimes(2);
});

test.each([usePost, useCurrentProfilePost])('nested post reaction summaries use the same failure policy', async hook => {
  mockRead.mockResolvedValueOnce({ data: { id: 'post' }, error: null, status: 200 })
    .mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'denied' }, status: 403 });
  await expect(client.fetchQuery(optionsFor(() => hook('post')))).rejects.toMatchObject({ status: 403 });
  expect(mockRpc).toHaveBeenLastCalledWith('get_post_reaction_summaries', { p_post_ids: ['post'] });
  expect(mockRead).toHaveBeenCalledTimes(2);
});

test('comment prefetch and mounted query share the same paged read', async () => {
  mockRead.mockResolvedValue({ data: [{ id: 'comment', created_at: '2026-09-28T15:00:00Z' }], error: null, status: 200 });
  await prefetchCommentsForPost(client, { postId: 'post', userId: 'member', audience: 'friends' });
  expect(mockRpc).toHaveBeenCalledWith('get_comment_thread_snapshot', {
    p_post_id: 'post', p_audience: 'friends', p_before_created_at: null, p_before_id: null, p_limit: 50,
  });
  expect(client.getQueryData(['comments', 'post', 'member', 'friends'])).toMatchObject({ pages: [[{ id: 'comment' }]] });
});

test('current state still owns the server clock and user event', async () => {
  const state = { server_now: '2026-09-28T14:22:00Z', user_event: { id: 'event' } };
  mockRead.mockResolvedValue({ data: state, error: null, status: 200 });
  expect(await client.fetchQuery(optionsFor(useUserEvent))).toEqual(state.user_event);
  expect(syncServerClock).toHaveBeenCalledWith(state.server_now);
  expect(mockRpc).toHaveBeenCalledWith('get_current_doji_state');
});

test('badge progress keeps the authorized field contract and hard bound', async () => {
  mockRead.mockResolvedValue({ data: [], error: null, status: 200 });
  await client.fetchQuery(optionsFor(() => useUserBadgeProgress('member')));
  expect(mockSelect).toHaveBeenCalledWith('user_id, category_id, current_tier, unlocked_at');
  expect(mockEq).toHaveBeenCalledWith('user_id', 'member');
  expect(mockLimit).toHaveBeenCalledWith(100);
});

test.each([
  ['suggestions', () => useMySuggestions('member'), 'id, user_id, kind, body, body_hash, options, status, admin_note, selected_at, reviewed_at, reviewed_by, created_at, reviewer:profiles!challenge_suggestions_reviewed_by_fkey(id, username, display_name, avatar_url)'],
  ['shop ownership', () => useOwnedShopItems('member'), 'user_id, item_key, purchased_at'],
] as const)('%s preserves member filtering, projection, bounds and rows', async (_name, hook, fields) => {
  const rows = [{ id: 'unchanged-row' }];
  mockRead.mockResolvedValue({ data: rows, error: null, status: 200 });
  expect(await client.fetchQuery(optionsFor(hook))).toEqual(rows);
  expect(mockSelect).toHaveBeenCalledWith(fields);
  expect(mockEq).toHaveBeenCalledWith('user_id', 'member');
  expect(mockLimit).toHaveBeenCalledWith(100);
});

test('reaction prefetch recovers once and preserves audience and pagination', async () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({ id: `${i}`, created_at: '2026-09-28T15:00:00Z' }));
  mockRead.mockResolvedValueOnce({ data: null, error: { message: 'unavailable' }, status: 503 })
    .mockResolvedValue({ data: rows, error: null, status: 200 });
  await prefetchPostReactions(client, { postId: 'post', userId: 'member', audience: 'friends' });
  expect(mockRead).toHaveBeenCalledTimes(2);
  expect(mockRpc).toHaveBeenLastCalledWith('get_post_reaction_voters_page', {
    p_post_id: 'post', p_audience: 'friends', p_limit: 50, p_before_created_at: null, p_before_id: null,
  });
  const options = optionsFor(() => usePostReactions('post', 'friends')) as any;
  expect(client.getQueryData(options.queryKey)).toEqual({ pages: [rows], pageParams: [null] });
  const cursor = options.getNextPageParam(rows);
  await options.queryFn({ pageParam: cursor, signal: new AbortController().signal });
  expect(mockRpc).toHaveBeenLastCalledWith('get_post_reaction_voters_page', {
    p_post_id: 'post', p_audience: 'friends', p_limit: 50, p_before_created_at: rows[49].created_at, p_before_id: '49',
  });
  expect(options.getNextPageParam([])).toBeUndefined();
});

test('reactions-given count retains its member RPC and numeric result', async () => {
  mockRead.mockResolvedValue({ data: 42, error: null, status: 200 });
  expect(await client.fetchQuery(optionsFor(() => useReactionsGivenCount('member')))).toBe(42);
  expect(mockRpc).toHaveBeenCalledWith('get_reactions_given_count', { p_user_id: 'member' });
});
