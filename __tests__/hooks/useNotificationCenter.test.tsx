import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNotificationCenter } from '../../hooks/useNotificationCenter';

let mockUserId: string | undefined = 'a';
const mockCommand = jest.fn();
const mockRead = jest.fn();
const mockHeaders = jest.fn();
const mockGetSession = jest.fn();
jest.mock('../../stores/useAuthStore', () => ({ useAuthStore: Object.assign(
  (select: any) => select({ session: mockUserId ? { user: { id: mockUserId } } : null }),
  { getState: () => ({ session: mockUserId ? { user: { id: mockUserId } } : null }) },
) }));
jest.mock('../../lib/commandGateway', () => ({ executeCommand: (...args: unknown[]) => mockCommand(...args) }));
jest.mock('../../lib/supabase', () => ({ supabase: {
  auth: { getSession: () => mockGetSession() },
  rpc: (name: string) => ({ setHeader: (...args: unknown[]) => {
    mockHeaders(...args);
    return { abortSignal: () => mockRead(name, mockUserId) };
  } }),
} }));
jest.mock('../../lib/notificationAttention', () => ({
  attentionReceiptsForItems: () => [], dismissPresentedNotificationsForReceipts: jest.fn(),
}));

const comment = (key: string) => ({ key, kind: 'comment', post_id: key, comment_id: key,
  actor: null, sortAt: '2026-09-26T18:00:00Z' });
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useNotificationCenter(), { wrapper });
  return { ...hook, client };
}

test('failed notification refresh keeps cached history, exposes retry and then recovers', async () => {
  const t = setup();
  try {
    await waitFor(() => expect(t.result.current.items).toHaveLength(2));
    await waitFor(() => expect(t.result.current.isRefetching).toBe(false));
    mockRead.mockResolvedValueOnce({ data: null, error: { message: 'private failure' }, status: 504 });
    await act(async () => { await t.result.current.retryRead(); });
    expect(t.result.current.items).toHaveLength(2);
    await waitFor(() => expect(t.result.current.readError).toMatchObject({ status: 504 }));
    await act(async () => { await t.result.current.retryRead(); });
    await waitFor(() => expect(t.result.current.readError).toBeNull());
    expect(t.result.current.items).toHaveLength(2);
  } finally { t.unmount(); t.client.clear(); }
});

test('authorization failure removes cached history rather than keeping unauthorized items visible', async () => {
  const t = setup();
  try {
    await waitFor(() => expect(t.result.current.items).toHaveLength(2));
    await waitFor(() => expect(t.result.current.isRefetching).toBe(false));
    mockRead.mockResolvedValueOnce({ data: null, error: { message: 'forbidden' }, status: 403 });
    await act(async () => { await t.result.current.retryRead(); });
    await waitFor(() => expect(t.result.current.readError).toMatchObject({ status: 403 }));
    expect(t.result.current.items).toHaveLength(0);
  } finally { t.unmount(); t.client.clear(); }
});
beforeEach(async () => {
  jest.clearAllMocks(); mockUserId = 'a';
  mockGetSession.mockReset().mockImplementation(async () => ({ data: { session: { user: { id: mockUserId }, access_token: `token-${mockUserId}` } }, error: null }));
  await AsyncStorage.clear();
  mockRead.mockImplementation(async (name, uid) => ({ error: null, data: name === 'get_notification_center_bootstrap'
    ? { state: null, dismissals: [], items: [comment(`${uid}-1`), comment(`${uid}-2`)] }
    : [comment(`${uid}-1`), comment(`${uid}-2`)] }));
  mockCommand.mockResolvedValue({ data: {}, error: null });
});

test('stalled bootstrap auth cannot block notification history forever or dispatch after its deadline', async () => {
  jest.useFakeTimers();
  let release!: (value: unknown) => void;
  mockGetSession.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const t = setup();
  try {
    await act(async () => { await jest.advanceTimersByTimeAsync(8000); });
    expect(t.result.current.prefsHydrated).toBe(true);
    await act(async () => { await t.result.current.clearNotificationHistory(); });
    expect(mockCommand).toHaveBeenCalledWith('clear_notification_history', expect.any(Object), expect.objectContaining({ expectedUserId: 'a' }));
    await act(async () => {
      release({ data: { session: { user: { id: 'a' }, access_token: 'late-token' } }, error: null });
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(mockRead.mock.calls.some(([name]) => name === 'get_notification_center_bootstrap')).toBe(false);
    expect(mockUserId).toBe('a');
  } finally { t.unmount(); t.client.clear(); jest.useRealTimers(); }
});

test('rapid dismissals are both hidden and persisted through the mounted hook', async () => {
  const t = setup();
  await waitFor(() => expect(t.result.current.items).toHaveLength(2));
  await act(async () => { await Promise.all([t.result.current.dismissItem('a-1'), t.result.current.dismissItem('a-2')]); });
  expect(t.result.current.items).toHaveLength(0);
  const saved = JSON.parse((await AsyncStorage.getItem('@doit/dismissed-notif-keys:a'))!);
  expect(Object.keys(saved)).toEqual(['a-1', 'a-2']);
  expect(mockCommand.mock.calls[0][2]).toMatchObject({ expectedUserId: 'a' });
  expect(mockHeaders).toHaveBeenCalledWith('Authorization', 'Bearer token-a');
  t.unmount(); t.client.clear();
});

test('switching accounts drops old placeholders and ignores in-flight history completion', async () => {
  const t = setup();
  await waitFor(() => expect(t.result.current.items).toHaveLength(2));
  let finish!: (value: unknown) => void;
  mockCommand.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  let pending!: Promise<void>;
  await act(async () => { pending = t.result.current.dismissItem('a-1'); });
  mockUserId = 'b'; t.rerender({});
  expect(t.result.current.items.some(item => item.key.startsWith('a-'))).toBe(false);
  await waitFor(() => expect(t.result.current.items.map(item => item.key)).toEqual(['b-1', 'b-2']));
  await act(async () => { finish({ error: null, data: {} }); await pending; });
  expect(t.result.current.items.map(item => item.key)).toEqual(['b-1', 'b-2']);
  expect(await AsyncStorage.getItem('@doit/dismissed-notif-keys:b')).toBe('{}');
  // The stale callback cannot dispatch against the new account either.
  expect(mockCommand).toHaveBeenCalledTimes(1);
  t.unmount(); t.client.clear();
});

test('clear failure restores history and rejects to the existing visible error feedback', async () => {
  const t = setup();
  await waitFor(() => expect(t.result.current.items).toHaveLength(2));
  mockCommand.mockResolvedValueOnce({ data: null, error: new Error('failed') });
  await act(async () => { await expect(t.result.current.clearNotificationHistory()).rejects.toThrow('failed'); });
  expect(t.result.current.items).toHaveLength(2);
  expect(t.result.current.isClearing).toBe(false);
  t.unmount(); t.client.clear();
});

test('sign-out ignores a bootstrap that finishes later', async () => {
  let finish!: (value: unknown) => void;
  mockRead.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const t = setup();
  await waitFor(() => expect(mockRead).toHaveBeenCalled());
  mockUserId = undefined; t.rerender({});
  await act(async () => { finish({ data: { items: [comment('a-1')], state: null, dismissals: [] }, error: null }); });
  expect(t.result.current.items).toHaveLength(0);
  expect(t.result.current.prefsHydrated).toBe(false);
  expect(mockCommand).not.toHaveBeenCalled();
  t.unmount(); t.client.clear();
});
