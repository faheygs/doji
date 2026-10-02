import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useNotificationCenter } from '../../hooks/useNotificationCenter';
import type { NotificationCenterItem } from '../../lib/notificationCenterTypes';

let mockUser: string | undefined;
const mockRead = jest.fn();
const mockRpc = jest.fn();
const mockCommand = jest.fn();
const mockSession = jest.fn();
const mockHeader = jest.fn();
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: Object.assign(
    (select: (state: unknown) => unknown) =>
      select({ session: mockUser ? { user: { id: mockUser } } : null }),
    { getState: () => ({ session: mockUser ? { user: { id: mockUser } } : null }) },
  ),
}));
jest.mock('../../lib/commandGateway', () => ({
  executeCommand: (...args: unknown[]) => mockCommand(...args),
}));
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => mockSession() },
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));
jest.mock('expo-notifications', () => ({
  getPresentedNotificationsAsync: jest.fn(),
  dismissNotificationAsync: jest.fn(),
  setBadgeCountAsync: jest.fn(),
}));
let client: QueryClient;
const originalOS = Platform.OS;
const now = '2026-10-02T00:00:00.000Z';
const earlier = '2026-10-01T00:00:00.000Z';
const item = (key: string, sortAt = earlier): NotificationCenterItem => ({
  key,
  kind: 'mention',
  post_id: 'post',
  comment_id: key,
  actor: null,
  sortAt,
});
function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function settle() {
  await act(async () => {});
}
async function tick(ms = 400) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}
beforeEach(async () => {
  jest.useFakeTimers({ now: Date.parse(now) });
  notifyManager.setScheduler((cb) => cb());
  jest.clearAllMocks();
  Platform.OS = 'android';
  mockUser = 'member';
  await AsyncStorage.clear();
  mockSession.mockReset().mockImplementation(async () => ({
    data: { session: { user: { id: mockUser }, access_token: `token-${mockUser}` } },
    error: null,
  }));
  mockRead.mockReset().mockImplementation(async (name) => ({
    data:
      name === 'get_notification_center_bootstrap'
        ? { state: null, dismissals: [], items: [item('one'), item('two')] }
        : [item('one'), item('two')],
    error: null,
  }));
  mockRpc.mockReset().mockImplementation((name: string) => ({
    retry: jest.fn(),
    setHeader: (...args: unknown[]) => {
      mockHeader(...args);
      return { retry: jest.fn(), abortSignal: () => mockRead(name) };
    },
  }));
  mockCommand.mockReset().mockResolvedValue({ data: {}, error: null });
  jest.mocked(Notifications.getPresentedNotificationsAsync).mockReset().mockResolvedValue([]);
  jest.mocked(Notifications.dismissNotificationAsync).mockReset().mockResolvedValue();
  jest.mocked(Notifications.setBadgeCountAsync).mockReset().mockResolvedValue(true);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});
afterEach(() => {
  cleanup();
  client.clear();
  jest.restoreAllMocks();
  jest.clearAllTimers();
  jest.useRealTimers();
  notifyManager.setScheduler((cb) => setTimeout(cb, 0));
  Platform.OS = originalOS;
});

test.each([
  [null, {}],
  ['["one",42]', { one: now }],
  ['{"one":"2026-10-02T00:00:00.000Z","invalid":42}', { one: now }],
  ['broken', {}],
  ['null', {}],
  ['42', {}],
])('bootstrap migrates and filters local dismissals safely (%s)', async (raw, expected) => {
  if (raw) await AsyncStorage.setItem('@doit/dismissed-notif-keys:member', raw);
  const { result } = renderHook(useNotificationCenter, { wrapper: Wrapper });
  await settle();
  expect(result.current.prefsHydrated).toBe(true);
  expect(mockRpc).toHaveBeenCalledWith('get_notification_center_bootstrap', {
    p_local_cleared_at: null,
    p_local_last_opened_at: null,
    p_local_dismissals: expected,
    p_limit: 200,
  });
  expect(JSON.parse((await AsyncStorage.getItem('@doit/dismissed-notif-keys:member'))!)).toEqual(
    expected,
  );
});
test.each([
  ['2026-09-30', '2026-10-01'],
  ['2026-10-01', '2026-09-30'],
  ['2026-10-01', null],
  [null, '2026-10-01'],
] as const)('history merge keeps the newest local=%s remote=%s receipt', async (local, remote) => {
  if (local)
    await AsyncStorage.multiSet([
      ['@doit/bell-cleared-at:member', local],
      ['@doit/bell-last-opened:member', local],
      ['@doit/dismissed-notif-keys:member', JSON.stringify({ one: local })],
    ]);
  mockRead.mockResolvedValueOnce({
    data: {
      state: { cleared_at: remote, last_opened_at: remote },
      dismissals: remote ? [{ notification_key: 'one', dismissed_at: remote }] : [],
      items: [item('one')],
    },
    error: null,
  });
  renderHook(useNotificationCenter, { wrapper: Wrapper });
  await settle();
  const expected = [local, remote]
    .filter((date) => date !== null)
    .sort()
    .at(-1);
  expect(await AsyncStorage.getItem('@doit/bell-cleared-at:member')).toBe(expected);
  expect(await AsyncStorage.getItem('@doit/bell-last-opened:member')).toBe(expected);
  expect(JSON.parse((await AsyncStorage.getItem('@doit/dismissed-notif-keys:member'))!)).toEqual({
    one: expected,
  });
});
test('bootstrap supports absent optional items and dismissals', async () => {
  mockRead.mockResolvedValueOnce({ data: { state: null }, error: null });
  const { result } = renderHook(useNotificationCenter, { wrapper: Wrapper });
  await settle();
  expect(result.current.items).toEqual([]);
  expect(result.current.prefsHydrated).toBe(true);
});
test('local storage read failure still permits a fresh authorized snapshot', async () => {
  jest.spyOn(AsyncStorage, 'multiGet').mockRejectedValueOnce(new Error('disk'));
  const { result } = renderHook(useNotificationCenter, { wrapper: Wrapper });
  await settle();
  expect(result.current.prefsHydrated).toBe(true);
  expect(result.current.items).toHaveLength(2);
  expect(mockRpc).toHaveBeenCalledWith('get_notification_center_snapshot', {
    p_since: '2026-09-02T00:00:00.000Z',
    p_limit: 200,
  });
});
test('disk persistence failure does not undo a successful server bootstrap', async () => {
  jest.spyOn(AsyncStorage, 'multiSet').mockRejectedValueOnce(new Error('disk'));
  const { result } = renderHook(useNotificationCenter, { wrapper: Wrapper });
  await settle();
  expect(result.current.prefsHydrated).toBe(true);
  expect(result.current.items).toHaveLength(2);
});
test.each(['error', 'wrong member', 'missing session'])(
  'snapshot rejects invalid authentication (%s)',
  async (reason) => {
    mockRead.mockResolvedValueOnce({ data: null, error: new Error('bootstrap unavailable') });
    mockSession
      .mockResolvedValueOnce({
        data: { session: { user: { id: 'member' }, access_token: 'token' } },
        error: null,
      })
      .mockResolvedValue({
        data: {
          session:
            reason === 'missing session'
              ? null
              : { user: { id: reason === 'wrong member' ? 'other' : 'member' } },
        },
        error: reason === 'error' ? new Error('auth') : null,
      });
    const { result } = renderHook(useNotificationCenter, { wrapper: Wrapper });
    await settle();
    expect(result.current.prefsHydrated).toBe(true);
    expect(result.current.items).toEqual([]);
    expect(result.current.readError).toBeTruthy();
    expect(mockRead).toHaveBeenCalledTimes(1);
  },
);
test('wrong bootstrap identity falls back locally without sending an unauthorized bootstrap', async () => {
  mockSession.mockResolvedValueOnce({ data: { session: { user: { id: 'other' } } }, error: null });
  const { result } = renderHook(useNotificationCenter, { wrapper: Wrapper });
  await settle();
  expect(result.current.prefsHydrated).toBe(true);
  expect(mockRpc.mock.calls.some(([name]) => name === 'get_notification_center_bootstrap')).toBe(
    false,
  );
});
test('account switch during disk hydration never hydrates or dispatches for the old account', async () => {
  const pending = deferred<readonly [string, string | null][]>();
  jest.spyOn(AsyncStorage, 'multiGet').mockReturnValueOnce(pending.promise);
  const { result, rerender } = renderHook(useNotificationCenter, { wrapper: Wrapper });
  mockUser = undefined;
  rerender({});
  await act(async () =>
    pending.resolve([
      ['cleared', null],
      ['opened', null],
      ['dismissed', null],
    ]),
  );
  expect(result.current.items).toEqual([]);
  expect(mockSession).not.toHaveBeenCalled();
});
test('account switch during auth bootstrap never sends the stale request', async () => {
  const pending = deferred<unknown>();
  mockSession.mockReturnValueOnce(pending.promise);
  const { result, rerender } = renderHook(useNotificationCenter, { wrapper: Wrapper });
  await settle();
  mockUser = undefined;
  rerender({});
  await act(async () =>
    pending.resolve({
      data: { session: { user: { id: 'member' }, access_token: 'old' } },
      error: null,
    }),
  );
  expect(result.current.items).toEqual([]);
  expect(mockRpc).not.toHaveBeenCalled();
});
test('null snapshot yields an empty list and does not manufacture notifications', async () => {
  const { result } = renderHook(useNotificationCenter, { wrapper: Wrapper });
  await settle();
  mockRead.mockResolvedValue({ data: null, error: null });
  await act(async () => {
    await result.current.retryRead();
  });
  expect(result.current.items).toEqual([]);
  expect(result.current.unreadCount).toBe(0);
});
test.each([
  null,
  { last_opened_at: 'invalid' },
  { last_opened_at: 4 },
  { last_opened_at: '2026-10-02T00:00:01Z' },
])('open receipt validates server time before persisting (%j)', async (data) => {
  const { result } = renderHook(useNotificationCenter, { wrapper: Wrapper });
  await settle();
  expect(result.current.unreadCount).toBe(2);
  mockCommand.mockResolvedValue({ data, error: null });
  await act(async () => {
    await result.current.markBellOpened();
  });
  expect(result.current.unreadCount).toBe(0);
  expect(Notifications.setBadgeCountAsync).toHaveBeenCalledWith(0);
  expect(await AsyncStorage.getItem('@doit/bell-last-opened:member')).toBe(
    data && typeof data.last_opened_at === 'string' && data.last_opened_at !== 'invalid'
      ? data.last_opened_at
      : now,
  );
});
test.each(['command', 'native', 'web'])(
  'bell opening tolerates %s failure or platform restriction without false state',
  async (mode) => {
    if (mode === 'web') Platform.OS = 'web';
    const { result } = renderHook(useNotificationCenter, { wrapper: Wrapper });
    await settle();
    if (mode === 'command') mockCommand.mockResolvedValue({ error: new Error('denied') });
    if (mode === 'native')
      jest.mocked(Notifications.setBadgeCountAsync).mockRejectedValue(new Error('unsupported'));
    await act(async () => {
      await result.current.markBellOpened();
    });
    expect(result.current.unreadCount).toBe(mode === 'command' ? 2 : 0);
    expect(Notifications.setBadgeCountAsync).toHaveBeenCalledTimes(mode === 'native' ? 1 : 0);
  },
);
test('callbacks held after sign-out cannot issue any history or attention command', async () => {
  const { result, rerender } = renderHook(useNotificationCenter, { wrapper: Wrapper });
  await settle();
  const stale = result.current;
  mockUser = undefined;
  rerender({});
  await act(async () => {
    await stale.dismissItem('one');
    await stale.markBellOpened();
    await stale.clearNotificationHistory();
    stale.markScopesSeen([{ scope_kind: 'comment', scope_id: 'one' }]);
    result.current.markScopesSeen([]);
    await result.current.clearNotificationHistory();
    await result.current.dismissItem('one');
    await result.current.markBellOpened();
  });
  await tick();
  expect(mockCommand).not.toHaveBeenCalled();
});
test('attention receipts deduplicate, wait 400ms, stay capped at 100 and dismiss only matching OS notifications', async () => {
  const native = (id: string, scope: string): Notifications.Notification => ({
    date: Date.parse(now),
    request: {
      identifier: id,
      trigger: { type: 'push' },
      content: {
        title: null,
        subtitle: null,
        body: null,
        categoryIdentifier: null,
        sound: null,
        data: { notificationScopeKind: 'comment', notificationScopeId: scope },
      },
    },
  });
  jest
    .mocked(Notifications.getPresentedNotificationsAsync)
    .mockResolvedValue([native('match', 'one'), native('unrelated', 'other')]);
  const { result } = renderHook(useNotificationCenter, { wrapper: Wrapper });
  await settle();
  act(() => {
    result.current.markItemsSeen([item('one'), item('one')]);
    result.current.markScopesSeen([{ scope_kind: 'comment', scope_id: '' }]);
    result.current.markScopesSeen(
      Array.from({ length: 101 }, (_, i) => ({ scope_kind: 'comment', scope_id: `comment-${i}` })),
    );
  });
  await tick(399);
  expect(mockCommand).not.toHaveBeenCalled();
  await tick(1);
  expect(mockCommand).toHaveBeenCalledTimes(1);
  expect(mockCommand.mock.calls[0][1].p_receipts).toHaveLength(100);
  expect(mockCommand.mock.calls[0][2]).toMatchObject({
    expectedUserId: 'member',
    isCurrent: expect.any(Function),
  });
  expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith('match');
  expect(Notifications.dismissNotificationAsync).not.toHaveBeenCalledWith('unrelated');
  await tick();
  expect(mockCommand).toHaveBeenCalledTimes(2);
  expect(mockCommand.mock.calls[1][1].p_receipts).toHaveLength(2);
});
test.each([false, true])(
  'failed attention receipt remains queued for the next visible interaction (throws=%s)',
  async (throws) => {
    const { result } = renderHook(useNotificationCenter, { wrapper: Wrapper });
    await settle();
    if (throws) mockCommand.mockRejectedValueOnce(new Error('network'));
    else mockCommand.mockResolvedValueOnce({ error: new Error('network') });
    act(() => result.current.markScopesSeen([{ scope_kind: 'comment', scope_id: 'one' }]));
    await tick();
    expect(Notifications.getPresentedNotificationsAsync).not.toHaveBeenCalled();
    await tick(3000);
    expect(mockCommand).toHaveBeenCalledTimes(1); // No unbounded background retry.
    act(() => result.current.markScopesSeen([{ scope_kind: 'comment', scope_id: 'two' }]));
    await tick();
    expect(mockCommand.mock.calls[1][1].p_receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope_id: 'one' }),
        expect.objectContaining({ scope_id: 'two' }),
      ]),
    );
  },
);
test('failed old attention write does not replace a more recent receipt for the same scope', async () => {
  const pending = deferred<{ error: Error }>();
  const { result } = renderHook(useNotificationCenter, { wrapper: Wrapper });
  await settle();
  mockCommand.mockReturnValueOnce(pending.promise);
  act(() => result.current.markScopesSeen([{ scope_kind: 'comment', scope_id: 'one' }]));
  await tick();
  act(() => result.current.markScopesSeen([{ scope_kind: 'comment', scope_id: 'one' }]));
  await act(async () => pending.resolve({ error: new Error('old failure') }));
  await tick();
  expect(mockCommand.mock.calls[1][1].p_receipts).toEqual([
    { scope_kind: 'comment', scope_id: 'one', seen_at: '2026-10-02T00:00:00.400Z' },
  ]);
});
test('OS cleanup failure cannot turn a successful durable attention receipt into a replay', async () => {
  jest.mocked(Notifications.getPresentedNotificationsAsync).mockRejectedValue(new Error('OS'));
  const { result } = renderHook(useNotificationCenter, { wrapper: Wrapper });
  await settle();
  act(() => result.current.markItemsSeen([item('one')]));
  await tick();
  await tick(1000);
  expect(mockCommand).toHaveBeenCalledTimes(1);
});
test('account change discards pending attention and ignores a completed old-account receipt', async () => {
  const pending = deferred<{ error: null }>();
  const { result, rerender } = renderHook(useNotificationCenter, { wrapper: Wrapper });
  await settle();
  mockCommand.mockReturnValueOnce(pending.promise);
  act(() => result.current.markItemsSeen([item('one')]));
  await tick();
  act(() => result.current.markItemsSeen([item('two')]));
  mockUser = undefined;
  rerender({});
  await act(async () => pending.resolve({ error: null }));
  await tick();
  expect(mockCommand).toHaveBeenCalledTimes(1);
  expect(Notifications.getPresentedNotificationsAsync).not.toHaveBeenCalled();
});
test('sign-out before a receipt timer fires prevents dispatch', async () => {
  const { result, rerender } = renderHook(useNotificationCenter, { wrapper: Wrapper });
  await settle();
  act(() => result.current.markItemsSeen([item('one')]));
  mockUser = undefined;
  rerender({});
  await tick();
  expect(mockCommand).not.toHaveBeenCalled();
});
