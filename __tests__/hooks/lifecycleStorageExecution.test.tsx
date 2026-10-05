import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthGate } from '../../hooks/useAuthGate';
import { useDismissOnRouteBlur } from '../../hooks/useDismissOnRouteBlur';
import { useFeedAudiencePreference } from '../../hooks/useFeedAudiencePreference';
import { useRecentProfileSearches } from '../../hooks/useRecentProfileSearches';
import { useServerCountdown } from '../../hooks/useServerCountdown';
import { useFocusedRealtimeInvalidation } from '../../hooks/useFocusedRealtimeInvalidation';
import { cancelScheduledInvalidations } from '../../lib/queryInvalidationBatcher';

let mockAuth: Record<string, unknown>;
let mockBlur: (() => void) | undefined;
const mockRouter = { replace: jest.fn(), dismissAll: jest.fn(), canDismiss: jest.fn(() => false) };
const mockSubscribe = jest.fn();
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: (select: (state: unknown) => unknown) => select(mockAuth),
}));
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useFocusEffect: (callback: () => (() => void) | undefined) => {
    const { useEffect } = jest.requireActual<typeof React>('react');
    useEffect(() => {
      mockBlur = callback();
      return () => {
        mockBlur?.();
        mockBlur = undefined;
      };
    }, [callback]);
  },
}));
jest.mock('../../lib/serverClock', () => ({ serverNowMs: () => Date.now() }));
jest.mock('../../lib/resilientRealtimeSubscription', () => ({
  startResilientRealtimeSubscription: (...args: unknown[]) => mockSubscribe(...args),
}));
const profile = (id: string) => ({
  id,
  username: id,
  display_name: id,
  avatar_url: null,
  avatar_gradient: ['#111111', '#222222'] as [string, string],
  equipped_border_key: null,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => {
  jest.clearAllMocks();
  mockBlur = undefined;
  jest.mocked(AsyncStorage.getItem).mockReset().mockResolvedValue(null);
  jest.mocked(AsyncStorage.setItem).mockReset().mockResolvedValue();
  mockAuth = {
    session: null,
    profile: null,
    isLoading: false,
    isProfileLoading: false,
    profileLoadState: 'ready',
  };
  mockSubscribe.mockReset().mockReturnValue(jest.fn());
});
afterEach(() => {
  cleanup();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('auth gate recomputes for loading, member, failed profile, banned and signed-out states', () => {
  const { result, rerender } = renderHook(useAuthGate);
  expect(result.current).toMatchObject({ ready: true, canUseAuthGroup: true, canUseApp: false });
  mockAuth = { ...mockAuth, session: { user: { id: 'member' } }, isLoading: true };
  rerender({});
  expect(result.current.ready).toBe(false);
  mockAuth = { ...mockAuth, isLoading: false, isProfileLoading: true };
  rerender({});
  expect(result.current.ready).toBe(false);
  mockAuth = { ...mockAuth, isProfileLoading: false, profileLoadState: 'error' };
  rerender({});
  expect(result.current.profileLoadFailed).toBe(true);
  mockAuth = {
    ...mockAuth,
    profileLoadState: 'ready',
    profile: { id: 'member', onboarding_completed_at: '2026-01-01' },
  };
  rerender({});
  expect(result.current.canUseApp).toBe(true);
  mockAuth = { ...mockAuth, profile: { id: 'member', is_banned: true } };
  rerender({});
  expect(result.current).toMatchObject({ canUseApp: false, canUseBannedScreen: true });
  mockAuth = { ...mockAuth, session: null, profile: null };
  rerender({});
  expect(result.current.canUseAuthGroup).toBe(true);
});

test.each([false, true])(
  'route blur dismisses only visible UI (%s) using the latest callback',
  (visible) => {
    const oldClose = jest.fn();
    const currentClose = jest.fn();
    const { rerender, unmount } = renderHook(
      ({ shown, close }: { shown: boolean; close: () => void }) =>
        useDismissOnRouteBlur(shown, close),
      { initialProps: { shown: false, close: oldClose } },
    );
    rerender({ shown: visible, close: currentClose });
    unmount();
    expect(oldClose).not.toHaveBeenCalled();
    expect(currentClose).toHaveBeenCalledTimes(visible ? 1 : 0);
  },
);

test.each(['friends', 'everyone', 'invalid', null])(
  'audience loads its account-scoped value (%s)',
  async (stored) => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(stored);
    const { result } = renderHook(() => useFeedAudiencePreference('member'));
    await act(async () => {});
    expect(result.current.audience).toBe(stored === 'friends' ? 'friends' : 'everyone');
    expect(AsyncStorage.getItem).toHaveBeenCalledWith('@doji/feed-audience:member');
  },
);
test('an explicit selection wins over an older storage read and persists to the correct account', async () => {
  const read = deferred<string | null>();
  jest.mocked(AsyncStorage.getItem).mockReturnValue(read.promise);
  const { result } = renderHook(() => useFeedAudiencePreference('member'));
  act(() => result.current.selectAudience('friends'));
  await act(async () => read.resolve('everyone'));
  expect(result.current.audience).toBe('friends');
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('@doji/feed-audience:member', 'friends');
});
test('late audience reads cannot cross an account change or sign-out', async () => {
  const read = deferred<string | null>();
  jest.mocked(AsyncStorage.getItem).mockReturnValueOnce(read.promise).mockResolvedValue('everyone');
  const { result, rerender } = renderHook(
    ({ user }: { user?: string }) => useFeedAudiencePreference(user),
    { initialProps: { user: 'first' } },
  );
  rerender({ user: 'second' });
  await act(async () => read.resolve('friends'));
  expect(result.current.audience).toBe('everyone');
  act(() => result.current.selectAudience('friends'));
  rerender({ user: undefined });
  expect(result.current.audience).toBe('everyone');
  jest.mocked(AsyncStorage.setItem).mockClear();
  act(() => result.current.selectAudience('friends'));
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});
test('unmounted preference does not consume a delayed storage result', async () => {
  const read = deferred<string | null>();
  jest.mocked(AsyncStorage.getItem).mockReturnValue(read.promise);
  const { unmount } = renderHook(() => useFeedAudiencePreference('member'));
  unmount();
  await act(async () => read.resolve('friends'));
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});

test('recent profile searches load, deduplicate, reorder, remove and clear with serialized writes', async () => {
  jest.mocked(AsyncStorage.getItem).mockResolvedValue(JSON.stringify([profile('first')]));
  const { result } = renderHook(() => useRecentProfileSearches('member'));
  await waitFor(() => expect(result.current.recents).toEqual([profile('first')]));
  act(() => result.current.record(profile('second')));
  act(() => result.current.record(profile('first')));
  expect(result.current.recents.map((p) => p.id)).toEqual(['first', 'second']);
  act(() => result.current.remove('first'));
  expect(result.current.recents).toEqual([profile('second')]);
  act(() => result.current.clear());
  await act(async () => {});
  expect(result.current.recents).toEqual([]);
  expect(jest.mocked(AsyncStorage.setItem).mock.calls).toEqual([
    ['doji:recent-profile-searches:member', JSON.stringify([profile('second'), profile('first')])],
    ['doji:recent-profile-searches:member', JSON.stringify([profile('first'), profile('second')])],
    ['doji:recent-profile-searches:member', JSON.stringify([profile('second')])],
    ['doji:recent-profile-searches:member', '[]'],
  ]);
});
test('recording while storage loads keeps the new interaction authoritative', async () => {
  const read = deferred<string | null>();
  jest.mocked(AsyncStorage.getItem).mockReturnValue(read.promise);
  const { result } = renderHook(() => useRecentProfileSearches('member'));
  act(() => result.current.record(profile('new')));
  await act(async () => read.resolve(JSON.stringify([profile('old')])));
  expect(result.current.recents).toEqual([profile('new')]);
});
test('recent history switches identity safely and ignores old reads after disposal', async () => {
  const read = deferred<string | null>();
  jest
    .mocked(AsyncStorage.getItem)
    .mockReturnValueOnce(read.promise)
    .mockResolvedValue(JSON.stringify([profile('second')]));
  const { result, rerender } = renderHook(
    ({ user }: { user?: string }) => useRecentProfileSearches(user),
    { initialProps: { user: 'first' } },
  );
  rerender({ user: 'second' });
  await act(async () => read.resolve(JSON.stringify([profile('first')])));
  expect(result.current.recents).toEqual([profile('second')]);
  rerender({ user: undefined });
  expect(result.current.recents).toEqual([]);
  act(() => result.current.record(profile('ignored')));
  act(() => result.current.remove('ignored'));
  act(() => result.current.clear());
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});
test('one rejected storage write does not prevent later recent-search updates', async () => {
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('storage unavailable'));
  const { result } = renderHook(() => useRecentProfileSearches('member'));
  await act(async () => {});
  act(() => result.current.record(profile('first')));
  await act(async () => {});
  act(() => result.current.record(profile('second')));
  await act(async () => {});
  expect(result.current.recents).toHaveLength(2);
  expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(
    'doji:recent-profile-searches:member',
    JSON.stringify([profile('second'), profile('first')]),
  );
});

test('countdown rounds up using server time, expires once and uses the latest callback', () => {
  jest.useFakeTimers({ now: Date.parse('2026-10-02T00:00:00Z') });
  const first = jest.fn();
  const second = jest.fn();
  const { result, rerender, unmount } = renderHook(
    ({ expiry, callback }: { expiry: string; callback: () => void }) =>
      useServerCountdown(expiry, { onExpire: callback }),
    { initialProps: { expiry: '2026-10-02T00:00:02.100Z', callback: first } },
  );
  expect(result.current).toBe(3);
  act(() => jest.advanceTimersByTime(1000));
  expect(result.current).toBe(2);
  rerender({ expiry: '2026-10-02T00:00:02.100Z', callback: second });
  act(() => jest.advanceTimersByTime(5000));
  expect(result.current).toBe(0);
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
  rerender({ expiry: '2026-10-02T00:00:07Z', callback: second });
  expect(result.current).toBe(1);
  act(() => jest.advanceTimersByTime(1000));
  expect(second).toHaveBeenCalledTimes(2);
  unmount();
  expect(jest.getTimerCount()).toBe(0);
});
test.each([null, undefined])(
  'missing expiry creates no timer or expiration callback (%s)',
  (expiry) => {
    jest.useFakeTimers();
    const onExpire = jest.fn();
    const { result } = renderHook(() => useServerCountdown(expiry, { onExpire }));
    expect(result.current).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
    expect(onExpire).not.toHaveBeenCalled();
  },
);
test('disabled countdown does not schedule ticks and an expired display needs no callback', () => {
  jest.useFakeTimers({ now: Date.parse('2026-10-02') });
  const { result } = renderHook(() => useServerCountdown('2026-10-01', { enabled: false }));
  expect(result.current).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
  const expired = renderHook(() => useServerCountdown('2026-10-01'));
  expect(expired.result.current).toBe(0);
});

test('focused realtime only invalidates configured roots, deduplicates events and unsubscribes', async () => {
  jest.useFakeTimers({ now: 1_800_000_000_000 });
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  client.setQueryData(['feed', 'member'], []);
  client.setQueryData(['profile', 'member'], []);
  client.setQueryData(['unrelated'], []);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const unsubscribe = jest.fn();
  mockSubscribe.mockReturnValue(unsubscribe);
  type Roots = readonly string[] | ((type: string) => readonly string[]);
  const { rerender, unmount } = renderHook(
    ({ roots, enabled }: { roots: Roots; enabled: boolean }) =>
      useFocusedRealtimeInvalidation('public:feed', roots, enabled),
    { wrapper, initialProps: { roots: ['feed'], enabled: false } },
  );
  expect(mockSubscribe).not.toHaveBeenCalled();
  rerender({ roots: ['feed'], enabled: true });
  expect(mockSubscribe).toHaveBeenCalledWith('public:feed', expect.any(Function), {
    rewind: '10s',
    scope: 'public',
  });
  const emit = mockSubscribe.mock.calls[0][1] as (event: {
    eventId?: string;
    type: string;
  }) => void;
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  act(() => {
    emit({ eventId: 'one', type: 'changed' });
    emit({ eventId: 'one', type: 'changed' });
  });
  await act(async () => jest.advanceTimersByTime(400));
  expect(invalidate).toHaveBeenCalledTimes(1);
  expect(client.getQueryState(['feed', 'member'])?.isInvalidated).toBe(true);
  expect(client.getQueryState(['profile', 'member'])?.isInvalidated).toBe(false);
  rerender({ roots: (type) => (type === 'profile.updated' ? ['profile'] : []), enabled: true });
  act(() => emit({ eventId: 'two', type: 'ignored' }));
  await act(async () => jest.advanceTimersByTime(400));
  expect(invalidate).toHaveBeenCalledTimes(1);
  act(() => emit({ type: 'profile.updated' }));
  await act(async () => jest.advanceTimersByTime(400));
  expect(invalidate).toHaveBeenCalledTimes(2);
  expect(client.getQueryState(['profile', 'member'])?.isInvalidated).toBe(true);
  expect(client.getQueryState(['unrelated'])?.isInvalidated).toBe(false);
  expect(mockSubscribe).toHaveBeenCalledTimes(1);
  unmount();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  cancelScheduledInvalidations(client);
  client.clear();
});
