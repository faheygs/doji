import { focusManager, onlineManager, QueryCache, QueryClient, QueryObserver } from '@tanstack/react-query';
import { createNativeReadLifecycle } from '../../lib/nativeReadLifecycle';
import { createRequestSignal, runAbortableQuery } from '../../lib/requestSignal';
import { awaitReadSignal } from '../../lib/awaitReadSignal';
import { queryClient as appClient } from '../../lib/queryClient';

jest.mock('../../lib/apiFailureTelemetry', () => ({ reportApiFailure: jest.fn() }));
jest.mock('../../lib/apiQueryCache', () => ({ createApiQueryCache: () => new (require('@tanstack/react-query').QueryCache)() }));
jest.mock('../../lib/memberReadDiagnostics', () => ({ beginReadDiagnostics: jest.fn(), finishReadDiagnostics: jest.fn(), inheritReadDiagnostics: jest.fn() }));

let client: QueryClient;
let lifecycle: ReturnType<typeof createNativeReadLifecycle>;
const terminalError = jest.fn();
const refreshProfile = jest.fn();
const stops: (() => void)[] = [];
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  onlineManager.setOnline(true);
  focusManager.setFocused(true);
  client = new QueryClient({
    queryCache: new QueryCache({ onError: terminalError }),
    defaultOptions: { queries: { retry: false, gcTime: Infinity, refetchOnReconnect: false, refetchOnWindowFocus: false },
      mutations: appClient.getDefaultOptions().mutations },
  });
  client.mount();
  lifecycle = createNativeReadLifecycle(client, {
    active: true, userId: 'member', isAdmin: false, isBanned: false, isCurrent: () => true, refreshProfile,
  });
});
afterEach(() => {
  lifecycle.dispose();
  for (const stop of stops.splice(0)) stop();
  client.unmount();
  client.clear();
  onlineManager.setOnline(true);
  focusManager.setFocused(undefined);
  jest.useRealTimers();
});
function observe(root: string, read: (signal: AbortSignal) => Promise<unknown>) {
  const observer = new QueryObserver(client, { queryKey: [root, 'member'], queryFn: ({ signal }) => read(signal) });
  stops.push(observer.subscribe(() => {}));
  return observer;
}

test('seven obsolete reads abort, survive 31 minutes offline without errors, then refresh once', async () => {
  const roots = ['feed', 'pollResults', 'pollVotersDetail', 'ownedShopItems', 'upcomingDoji', 'userEvent', 'notificationCenter'];
  const signals: AbortSignal[] = [];
  const late: ((value: { error: null; data: string }) => void)[] = [];
  const reads = roots.map(root => {
    client.setQueryData([root, 'member'], { error: null, data: 'cached' });
    let count = 0;
    const read = jest.fn((parent: AbortSignal) => runAbortableQuery({
      abortSignal: signal => {
        signals.push(signal);
        return ++count === 1 ? new Promise<{ error: null; data: string }>(resolve => { late.push(resolve); }) : Promise.resolve({ error: null, data: 'fresh' });
      },
    }, parent));
    observe(root, read);
    return read;
  });
  expect(signals).toHaveLength(7);
  lifecycle.network({ isConnected: false });
  lifecycle.appState('background');
  await flush();
  expect(signals.every(signal => signal.aborted)).toBe(true);
  await jest.advanceTimersByTimeAsync(31 * 60_000);
  for (const root of roots) expect(client.getQueryData([root, 'member'])).toEqual({ error: null, data: 'cached' });
  expect(terminalError).not.toHaveBeenCalled();
  lifecycle.appState('active');
  await flush();
  reads.forEach(read => expect(read).toHaveBeenCalledTimes(1));
  lifecycle.network({ isConnected: true, isInternetReachable: true });
  await flush();
  reads.forEach(read => expect(read).toHaveBeenCalledTimes(2));
  expect(refreshProfile).toHaveBeenCalledTimes(1);
  late.forEach(resolve => resolve({ error: null, data: 'obsolete' }));
  await flush();
  for (const root of roots) expect(client.getQueryData([root, 'member'])).toEqual({ error: null, data: 'fresh' });
  expect(terminalError).not.toHaveBeenCalled();
});

test('mounts and realtime invalidations while backgrounded wait; duplicate hints do not multiply reads', async () => {
  lifecycle.appState('background');
  const read = jest.fn(async () => 'fresh');
  observe('feed', read);
  await client.invalidateQueries({ queryKey: ['feed'] }, { cancelRefetch: false });
  expect(read).not.toHaveBeenCalled();
  lifecycle.appState('active');
  lifecycle.appState('active');
  lifecycle.network({ isConnected: true });
  await flush();
  expect(read).toHaveBeenCalledTimes(1);
});

test.each([{ isConnected: false }, { isInternetReachable: false }, { type: 'NONE' }])('known offline pauses reads: %p', async state => {
  lifecycle.network(state);
  const read = jest.fn(async () => 'fresh');
  observe('feed', read);
  await flush();
  expect(read).not.toHaveBeenCalled();
  lifecycle.network({});
  await flush();
  expect(read).toHaveBeenCalledTimes(1);
});

test('flapping and disposal invalidate pending recovery callbacks', async () => {
  lifecycle.appState('background');
  lifecycle.appState('active');
  lifecycle.appState('background');
  await flush();
  expect(onlineManager.isOnline()).toBe(false);
  expect(refreshProfile).not.toHaveBeenCalled();
  lifecycle.appState('active');
  lifecycle.dispose();
  await flush();
  expect(onlineManager.isOnline()).toBe(false);
});

test('commands execute once and fail immediately, never enter an offline replay queue', async () => {
  lifecycle.network({ isConnected: false });
  const command = jest.fn().mockRejectedValue(new Error('offline command'));
  const mutation = client.getMutationCache().build(client, { mutationFn: command });
  await expect(mutation.execute(undefined)).rejects.toThrow('offline command');
  expect(mutation.state.isPaused).toBe(false);
  lifecycle.network({ isConnected: true });
  await flush();
  expect(command).toHaveBeenCalledTimes(1);
});

test('background cancellation excludes query-shaped claims and non-authorized admin queries', async () => {
  const signals: AbortSignal[] = [];
  for (const root of ['appAnnouncement', 'admin', 'localDraft']) {
    observe(root, signal => { signals.push(signal); return new Promise(() => {}); });
  }
  lifecycle.appState('background');
  await flush();
  expect(signals.every(signal => !signal.aborted)).toBe(true);
});

test('real foreground failures remain visible to terminal error reporting', async () => {
  const failure = Object.assign(new Error('service unavailable'), { status: 503 });
  observe('feed', async () => { throw failure; });
  await flush();
  expect(terminalError).toHaveBeenCalledWith(failure, expect.anything());
});

test('background cancels retry backoff instead of reviving its stale deadline on resume', async () => {
  let count = 0;
  const read = jest.fn(async () => { if (++count === 1) throw new Error('network failed'); return 'fresh'; });
  const observer = new QueryObserver(client, { queryKey: ['feed'], queryFn: read, retry: 1, retryDelay: 500 });
  stops.push(observer.subscribe(() => {}));
  await flush();
  lifecycle.appState('background');
  await jest.advanceTimersByTimeAsync(31 * 60_000);
  expect(read).toHaveBeenCalledTimes(1);
  lifecycle.appState('active');
  await flush();
  expect(read).toHaveBeenCalledTimes(2);
  expect(terminalError).not.toHaveBeenCalled();
});

test('cancelled auth wait cannot dispatch late HTTP work or write another account cache', async () => {
  let authorize!: () => void;
  const auth = new Promise<void>(resolve => { authorize = resolve; });
  const dispatch = jest.fn();
  observe('notificationCenter', async parent => {
    const request = createRequestSignal(parent);
    try {
      await awaitReadSignal(auth, request.signal);
      if (!request.signal.aborted) dispatch();
      return 'old-account';
    } finally { request.cleanup(); }
  });
  lifecycle.appState('background');
  lifecycle.dispose();
  client.clear();
  client.setQueryData(['notificationCenter', 'new-account'], 'new-account');
  authorize();
  await flush();
  expect(dispatch).not.toHaveBeenCalled();
  expect(client.getQueryData(['notificationCenter', 'member'])).toBeUndefined();
  expect(client.getQueryData(['notificationCenter', 'new-account'])).toBe('new-account');
  expect(terminalError).not.toHaveBeenCalled();
});

test('a genuine foreground deadline still reports a timeout', async () => {
  observe('feed', parent => runAbortableQuery({ abortSignal: () => new Promise(() => {}) }, parent, 100));
  await jest.advanceTimersByTimeAsync(100);
  expect(terminalError).toHaveBeenCalledWith(expect.objectContaining({ name: 'TimeoutError', abortSource: 'deadline' }), expect.anything());
});
test('failed reconciliation cannot strand availability; disposed callbacks are inert', async () => {
  const invalidate = jest.spyOn(client, 'invalidateQueries').mockRejectedValueOnce(new Error('test invalidation failed'));
  lifecycle.appState('background');
  lifecycle.appState('active');
  await flush();
  expect(onlineManager.isOnline()).toBe(true);
  lifecycle.dispose();
  lifecycle.appState('background');
  lifecycle.network({ isConnected: false });
  expect(onlineManager.isOnline()).toBe(true);
  invalidate.mockRestore();
});
