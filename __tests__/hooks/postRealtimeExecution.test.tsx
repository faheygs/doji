import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePostRealtimeInvalidation } from '../../hooks/usePostRealtimeInvalidation';
import { cancelScheduledInvalidations } from '../../lib/queryInvalidationBatcher';
import type { FeedAudience } from '../../lib/feedAudience';

const mockSubscribe = jest.fn();
const mockRead = jest.fn();
const mockRpc = jest.fn();
const mockUnsubscribe = jest.fn();
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => (() => void) | undefined) => {
    jest.requireActual<typeof React>('react').useEffect(callback, [callback]);
  },
}));
jest.mock('../../lib/resilientRealtimeSubscription', () => ({
  startResilientRealtimeSubscription: (...args: unknown[]) => mockSubscribe(...args),
}));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: { getState: () => ({ session: { user: { id: 'member' } } }) },
}));
jest.mock('../../lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));
let client: QueryClient;
const originalScale = process.env.EXPO_PUBLIC_SCALE_READ_URL;
function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
const emit = (type: string, eventId?: string) =>
  (mockSubscribe.mock.calls.at(-1)?.[1] as (e: { type: string; eventId?: string }) => void)({
    type,
    eventId,
  });
const snapshot = {
  post_id: 'post',
  reaction_count: 3,
  comment_count: 4,
  reaction_breakdown: {},
  my_reactions: [],
};
beforeEach(() => {
  jest.useFakeTimers({ now: 1_800_000_000_000 });
  jest.clearAllMocks();
  delete process.env.EXPO_PUBLIC_SCALE_READ_URL;
  mockSubscribe.mockReturnValue(mockUnsubscribe);
  mockRead.mockReset().mockResolvedValue({ data: snapshot, error: null });
  mockRpc.mockImplementation(() => ({ retry: jest.fn(), abortSignal: () => mockRead() }));
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  for (const root of [
    'comments',
    'reactions',
    'pollVoteLikes',
    'pollVotersDetail',
    'pollResults',
    'post',
    'unrelated',
  ]) {
    client.setQueryData([root, 'post'], { id: 'post' });
    client.setQueryData([root, 'other'], { id: 'other' });
  }
  client.setQueryData(['feed', 'day', 'everyone', 'member'], {
    pages: [[{ id: 'post', reaction_count: 0 }]],
    pageParams: [null],
  });
});
afterEach(() => {
  cleanup();
  cancelScheduledInvalidations(client);
  client.clear();
  jest.useRealTimers();
  if (originalScale === undefined) delete process.env.EXPO_PUBLIC_SCALE_READ_URL;
  else process.env.EXPO_PUBLIC_SCALE_READ_URL = originalScale;
});
async function flush(ms = 400) {
  await act(async () => jest.advanceTimersByTime(ms));
}
test('disabled cards never subscribe and changes of identity clean up the previous channel', () => {
  const { rerender, unmount } = renderHook(
    ({ id, enabled }: { id: string; enabled: boolean }) => usePostRealtimeInvalidation(id, enabled),
    { wrapper: Wrapper, initialProps: { id: 'post', enabled: false } },
  );
  expect(mockSubscribe).not.toHaveBeenCalled();
  rerender({ id: 'post', enabled: true });
  expect(mockSubscribe).toHaveBeenCalledWith(
    'post:post',
    expect.any(Function),
    expect.objectContaining({ scope: 'post', rewind: '10s' }),
  );
  rerender({ id: 'next', enabled: true });
  expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  expect(mockSubscribe.mock.calls[1][0]).toBe('post:next');
  unmount();
  expect(mockUnsubscribe).toHaveBeenCalledTimes(2);
});
test.each([
  ['feed.reaction.created', true, false, true],
  ['feed.comment.created', true, true, false],
  ['feed.comment_like.created', false, true, false],
  ['unknown', false, false, false],
] as const)(
  '%s refreshes only the relevant engagement and exact post query roots',
  async (type, engagement, comments, reactions) => {
    renderHook(() => usePostRealtimeInvalidation('post', true), { wrapper: Wrapper });
    act(() => {
      emit(type, 'event');
      emit(type, 'event');
    });
    await flush();
    expect(mockRpc).toHaveBeenCalledTimes(engagement ? 1 : 0);
    if (engagement) {
      expect(mockRpc).toHaveBeenCalledWith('get_post_engagement_snapshot_v2', {
        p_post_id: 'post',
        p_audience: 'everyone',
      });
      expect(client.getQueryData(['post', 'post'])).toMatchObject({
        reaction_count: 3,
        comment_count: 4,
      });
    }
    expect(client.getQueryState(['comments', 'post'])?.isInvalidated).toBe(comments);
    expect(client.getQueryState(['reactions', 'post'])?.isInvalidated).toBe(reactions);
    expect(client.getQueryState(['comments', 'other'])?.isInvalidated).toBe(false);
    expect(client.getQueryState(['reactions', 'other'])?.isInvalidated).toBe(false);
    expect(client.getQueryState(['unrelated', 'post'])?.isInvalidated).toBe(false);
  },
);
test.each(['friends', 'everyone'] as const)(
  'global poll voting respects %s audience scope',
  async (audience) => {
    renderHook(() => usePostRealtimeInvalidation('post', true, audience), { wrapper: Wrapper });
    act(() => emit('poll.vote.created'));
    await flush();
    expect(client.getQueryState(['pollResults', 'post'])?.isInvalidated).toBe(
      audience === 'everyone',
    );
    expect(client.getQueryState(['pollVotersDetail', 'post'])?.isInvalidated).toBe(
      audience === 'everyone',
    );
    expect(mockRpc).not.toHaveBeenCalled();
  },
);
test('poll vote likes target only voter and like lists', async () => {
  renderHook(() => usePostRealtimeInvalidation('post', true), { wrapper: Wrapper });
  act(() => emit('poll.vote_like.changed'));
  await flush();
  expect(client.getQueryState(['pollVoteLikes', 'post'])?.isInvalidated).toBe(true);
  expect(client.getQueryState(['pollVotersDetail', 'post'])?.isInvalidated).toBe(true);
  expect(client.getQueryState(['pollResults', 'post'])?.isInvalidated).toBe(false);
  expect(mockRpc).not.toHaveBeenCalled();
});
test('access loss revalidates authorization-dependent roots rather than fabricating visible data', async () => {
  renderHook(() => usePostRealtimeInvalidation('post', true), { wrapper: Wrapper });
  const options = mockSubscribe.mock.calls[0][2] as { onAccessUnavailable: () => void };
  act(options.onAccessUnavailable);
  await flush();
  for (const root of ['post', 'comments', 'reactions'])
    expect(client.getQueryState([root, 'post'])?.isInvalidated).toBe(true);
  expect(client.getQueryState(['feed', 'day', 'everyone', 'member'])?.isInvalidated).toBe(true);
  expect(client.getQueryState(['unrelated', 'post'])?.isInvalidated).toBe(false);
});
test('a burst coalesces into one snapshot and one invalidation for each engagement list', async () => {
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  renderHook(() => usePostRealtimeInvalidation('post', true), { wrapper: Wrapper });
  act(() => {
    emit('feed.comment.created', 'one');
    emit('feed.reaction.created', 'two');
    emit('feed.comment_like.created', 'three');
  });
  await flush();
  expect(mockRead).toHaveBeenCalledTimes(1);
  expect(invalidate.mock.calls.filter(([args]) => args?.refetchType === 'active')).toHaveLength(2);
});
test('hints received during a snapshot are coalesced into one follow-up after that snapshot settles', async () => {
  let resolve!: (value: { data: typeof snapshot; error: null }) => void;
  mockRead.mockReturnValueOnce(
    new Promise((r) => {
      resolve = r;
    }),
  );
  renderHook(() => usePostRealtimeInvalidation('post', true), { wrapper: Wrapper });
  act(() => emit('feed.comment.created', 'one'));
  await flush(80);
  expect(mockRead).toHaveBeenCalledTimes(1);
  act(() => {
    emit('feed.reaction.created', 'two');
    emit('feed.reaction.created', 'three');
  });
  await flush(80);
  expect(mockRead).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ data: snapshot, error: null }));
  await flush(80);
  expect(mockRead).toHaveBeenCalledTimes(2);
});
test('a failed snapshot does not leave the batching state stuck', async () => {
  mockRead.mockResolvedValueOnce({
    error: { message: 'temporary', code: 'XX000' },
    status: 503,
    data: null,
  });
  renderHook(() => usePostRealtimeInvalidation('post', true), { wrapper: Wrapper });
  act(() => emit('feed.reaction.created', 'first'));
  await flush();
  act(() => emit('feed.reaction.created', 'second'));
  await flush();
  expect(mockRead).toHaveBeenCalledTimes(2);
  expect(client.getQueryData(['post', 'post'])).toMatchObject({ reaction_count: 3 });
});
test('blur cancels the pending batch without an unnecessary snapshot', async () => {
  const { unmount } = renderHook(
    () => usePostRealtimeInvalidation('post', true, 'friends' as FeedAudience),
    { wrapper: Wrapper },
  );
  act(() => emit('feed.comment.created'));
  unmount();
  await flush();
  expect(mockRead).not.toHaveBeenCalled();
  expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
});
