import React from 'react';
import { act, render } from '@testing-library/react-native';
import { AppState, InteractionManager, Text, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, dehydrate } from '@tanstack/react-query';
import { QueryCachePersistence } from '../../components/QueryCachePersistence';
import { queryClient } from '../../lib/queryClient';
import { queryCacheStorageKey } from '../../lib/queryPersistence';

const mockBootstrap = jest.fn();
let mockUser: string | undefined = 'member';
jest.mock('../../lib/initialSessionBootstrap', () => ({
  initialSessionBootstrap: { get: () => mockBootstrap() },
}));
jest.mock('../../lib/queryClient', () => ({
  queryClient: new (require('@tanstack/react-query').QueryClient)({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  }),
}));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: { getState: () => ({ session: mockUser ? { user: { id: mockUser } } : null }) },
}));
let appState: (state: AppStateStatus) => void;
const remove = jest.fn(),
  cancel = jest.fn();
let interaction: (() => void) | undefined;
const storage = jest.mocked(AsyncStorage);
const tree = (
  <QueryCachePersistence>
    <Text>Ready</Text>
  </QueryCachePersistence>
);
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};
const snapshot = (savedAt = Date.now(), value = 'disk', updatedAt = Date.now() - 10) => {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  client.setQueryData(['profile', 'member'], value, { updatedAt });
  const result = JSON.stringify({ savedAt, state: dehydrate(client) });
  client.clear();
  return result;
};
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  queryClient.clear();
  mockUser = 'member';
  interaction = undefined;
  mockBootstrap.mockResolvedValue({ user: { id: 'member' } });
  storage.getItem.mockResolvedValue(null);
  storage.setItem.mockResolvedValue();
  storage.removeItem.mockResolvedValue();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, cb) => {
    appState = cb;
    return { remove };
  });
  jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((cb) => {
    interaction = cb as () => void;
    return { cancel, then: jest.fn(), done: jest.fn() };
  });
});
afterEach(() => {
  queryClient.clear();
  jest.restoreAllMocks();
  jest.useRealTimers();
});
it('warms authorized disk cache then marks it stale, preserving unrelated cache', async () => {
  storage.getItem.mockResolvedValue(snapshot());
  queryClient.setQueryData(['friends', 'member'], ['fresh']);
  const ui = render(tree);
  expect(ui.queryByText('Ready')).toBeNull();
  await flush();
  expect(ui.getByText('Ready')).toBeTruthy();
  expect(queryClient.getQueryData(['profile', 'member'])).toBe('disk');
  expect(queryClient.getQueryState(['profile', 'member'])?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(['friends', 'member'])?.isInvalidated).toBe(false);
});
it('never overwrites or invalidates a newer network result', async () => {
  storage.getItem.mockResolvedValue(snapshot());
  queryClient.setQueryData(['profile', 'member'], 'network', { updatedAt: Date.now() });
  render(tree);
  await flush();
  expect(queryClient.getQueryData(['profile', 'member'])).toBe('network');
  expect(queryClient.getQueryState(['profile', 'member'])?.isInvalidated).toBe(false);
});
it('ignores snapshots older than six hours', async () => {
  storage.getItem.mockResolvedValue(snapshot(Date.now() - 6 * 3600000 - 1));
  render(tree);
  await flush();
  expect(queryClient.getQueryData(['profile', 'member'])).toBeUndefined();
});
it.each(['invalid json', 'read failure'])('clears a corrupt/unreadable cache: %s', (kind) => {
  if (kind === 'invalid json') storage.getItem.mockResolvedValue('{broken');
  else storage.getItem.mockRejectedValue(new Error('disk'));
  render(tree);
  return flush().then(() =>
    expect(storage.removeItem).toHaveBeenCalledWith(queryCacheStorageKey('member')),
  );
});
it('does not attempt account-scoped persistence without a session', async () => {
  mockBootstrap.mockResolvedValue(null);
  mockUser = undefined;
  render(tree);
  await flush();
  expect(storage.getItem).not.toHaveBeenCalled();
  act(() => appState('background'));
  expect(storage.setItem).not.toHaveBeenCalled();
});
it('releases UI on session failure without deleting another account cache', async () => {
  mockBootstrap.mockRejectedValue(new Error('bootstrap'));
  const ui = render(tree);
  await flush();
  expect(ui.getByText('Ready')).toBeTruthy();
  expect(storage.removeItem).not.toHaveBeenCalled();
});
it('bounds startup delay while still hydrating late disk reads', async () => {
  let resolve!: (s: string) => void;
  storage.getItem.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const ui = render(tree);
  await flush();
  act(() => jest.advanceTimersByTime(1200));
  await flush();
  expect(ui.getByText('Ready')).toBeTruthy();
  await act(async () => resolve(snapshot()));
  expect(queryClient.getQueryData(['profile', 'member'])).toBe('disk');
});
it.each([false, true])(
  'ignores late bootstrap or disk completion after unmount disk=%s',
  (disk) => {
    let resolve!: (s: never) => void;
    const pending = new Promise<never>((r) => {
      resolve = r;
    });
    if (disk) storage.getItem.mockReturnValue(pending);
    else mockBootstrap.mockReturnValue(pending);
    const ui = render(tree);
    return flush().then(async () => {
      ui.unmount();
      await act(async () => resolve((disk ? snapshot() : { user: { id: 'member' } }) as never));
      expect(queryClient.getQueryData(['profile', 'member'])).toBeUndefined();
    });
  },
);
it('debounces writes until interactions finish and strips bearer URLs, later pages and mutations', async () => {
  render(tree);
  await flush();
  act(() => {
    queryClient.setQueryData(['profile', 'member'], {
      photo: 'https://example.test/storage/v1/object/sign/private',
      name: 'safe',
    });
    queryClient.setQueryData(['feed', 'member'], {
      pages: [[1], [2]],
      pageParams: [null, 'cursor'],
    });
    queryClient.setQueryData(['searchDraft'], 'private');
  });
  act(() => jest.advanceTimersByTime(1999));
  expect(storage.setItem).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(1));
  expect(storage.setItem).not.toHaveBeenCalled();
  await act(async () => interaction?.());
  const saved = JSON.parse(storage.setItem.mock.calls[0][1]);
  expect(saved.state.queries).toHaveLength(2);
  expect(saved.state.mutations).toEqual([]);
  expect(
    saved.state.queries.find((q: { queryKey: string[] }) => q.queryKey[0] === 'profile').state.data
      .photo,
  ).toBeNull();
  expect(
    saved.state.queries.find((q: { queryKey: string[] }) => q.queryKey[0] === 'feed').state.data,
  ).toEqual({ pages: [[1]], pageParams: [null] });
});
it('caps snapshots at 80 newest queries and skips oversized rows', async () => {
  render(tree);
  await flush();
  act(() => {
    for (let i = 0; i < 90; i++)
      queryClient.setQueryData(['profile', i], i, { updatedAt: Date.now() + i });
    queryClient.setQueryData(['feed', 'huge'], 'x'.repeat(1600000), {
      updatedAt: Date.now() + 100,
    });
    appState('background');
  });
  const saved = JSON.parse(storage.setItem.mock.calls[0][1]);
  expect(saved.state.queries).toHaveLength(80);
  expect(saved.state.queries[0].queryKey).toEqual(['profile', 89]);
  expect(saved.state.queries.some((q: { queryKey: string[] }) => q.queryKey[0] === 'feed')).toBe(
    false,
  );
});
it('flushes on background, cancels scheduled work and tolerates storage failure', async () => {
  storage.setItem.mockRejectedValue(new Error('full'));
  const ui = render(tree);
  await flush();
  act(() => {
    queryClient.setQueryData(['profile'], 1);
    appState('active');
  });
  expect(storage.setItem).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(2000));
  const old = interaction;
  act(() => {
    queryClient.setQueryData(['profile'], 2);
    jest.advanceTimersByTime(2000);
  });
  expect(cancel).toHaveBeenCalled();
  await act(async () => appState('inactive'));
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  ui.unmount();
  expect(remove).toHaveBeenCalled();
  await act(async () => old?.());
  expect(storage.setItem).toHaveBeenCalledTimes(1);
});
