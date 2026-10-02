import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDomainRealtime } from '../../hooks/useDomainRealtime';
import { closeRealtimeConnection, onRealtimeConnectionChange } from '../../lib/realtimeClient';
import { startResilientRealtimeSubscription } from '../../lib/resilientRealtimeSubscription';
import { reconcileAppQueries } from '../../lib/reconcileQueries';
import { handleDomainRealtimeEvent } from '../../lib/domainRealtimeHandler';
import { scheduleQueryInvalidation } from '../../lib/queryInvalidationBatcher';

let mockAdmin = false;
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ profile: { is_admin: mockAdmin } }),
}));
jest.mock('../../lib/realtimeClient', () => ({
  closeRealtimeConnection: jest.fn(),
  onRealtimeConnectionChange: jest.fn(),
}));
jest.mock('../../lib/resilientRealtimeSubscription', () => ({
  startResilientRealtimeSubscription: jest.fn(),
}));
jest.mock('../../lib/reconcileQueries', () => ({ reconcileAppQueries: jest.fn() }));
jest.mock('../../lib/domainRealtimeHandler', () => ({ handleDomainRealtimeEvent: jest.fn() }));
jest.mock('../../lib/queryInvalidationBatcher', () => ({ scheduleQueryInvalidation: jest.fn() }));

let client: QueryClient;
const removeListener = jest.fn();
const subscriptions: jest.Mock[] = [];
function setup(userId: string | undefined = 'member') {
  return renderHook(({ id }: { id: string | undefined }) => useDomainRealtime(id), {
    initialProps: { id: userId },
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}
function connection(current: string) {
  const listener = jest.mocked(onRealtimeConnectionChange).mock.calls.at(-1)![0];
  act(() => listener({ current } as never));
}
function event(index = 0, eventId: string | undefined = 'event') {
  const listener = jest.mocked(startResilientRealtimeSubscription).mock.calls[index][1];
  act(() => listener({ eventId, type: 'doji.activated', payload: {} } as never));
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockAdmin = false;
  subscriptions.length = 0;
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  jest.mocked(onRealtimeConnectionChange).mockReturnValue(removeListener);
  jest.mocked(startResilientRealtimeSubscription).mockImplementation(() => {
    const unsubscribe = jest.fn();
    subscriptions.push(unsubscribe);
    return unsubscribe;
  });
});
afterEach(() => {
  cleanup();
  client.clear();
  jest.useRealTimers();
});

test.each([true, false])('subscribes only to allowed channels (admin=%s)', (admin) => {
  mockAdmin = admin;
  setup();
  expect(
    jest.mocked(startResilientRealtimeSubscription).mock.calls.map((call) => [call[0], call[2]]),
  ).toEqual([
    ['doji:global', { rewind: '2m', scope: 'app' }],
    ['user:member:events', { rewind: '2m', scope: 'app' }],
    ...(admin ? [['moderation:global', { rewind: '2m', scope: 'public' }]] : []),
  ]);
});
test('anonymous session closes transport without subscribing', () => {
  const view = setup();
  view.rerender({ id: undefined });
  expect(closeRealtimeConnection).toHaveBeenCalledTimes(1);
  expect(removeListener).toHaveBeenCalledTimes(1);
  expect(subscriptions.every((unsubscribe) => unsubscribe.mock.calls.length === 1)).toBe(true);
});
test('first connection needs no duplicate read; reconnects are coalesced and bounded', () => {
  setup();
  connection('connected');
  connection('disconnected');
  act(() => jest.advanceTimersByTime(500));
  expect(reconcileAppQueries).not.toHaveBeenCalled();
  connection('connected');
  connection('connected');
  act(() => jest.advanceTimersByTime(99));
  expect(reconcileAppQueries).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(401));
  expect(reconcileAppQueries).toHaveBeenCalledTimes(1);
  expect(reconcileAppQueries).toHaveBeenCalledWith(client, { userId: 'member', isAdmin: false });
});
test('event IDs deduplicate across both channels and dispatch invalidation through batching', () => {
  setup();
  event(0);
  event(1);
  expect(handleDomainRealtimeEvent).toHaveBeenCalledTimes(1);
  const context = jest.mocked(handleDomainRealtimeEvent).mock.calls[0][0];
  expect(context.userId).toBe('member');
  expect(context.queryClient).toBe(client);
  context.invalidateRoots('feed', 'userEvent');
  expect(scheduleQueryInvalidation).toHaveBeenCalledWith(client, ['feed', 'userEvent']);
});
test('switching accounts closes the old connection and clears old event IDs', () => {
  const view = setup();
  event();
  view.rerender({ id: 'other' });
  event(2);
  expect(closeRealtimeConnection).toHaveBeenCalledTimes(1);
  expect(subscriptions[0]).toHaveBeenCalledTimes(1);
  expect(subscriptions[1]).toHaveBeenCalledTimes(1);
  expect(handleDomainRealtimeEvent).toHaveBeenCalledTimes(2);
  expect(jest.mocked(handleDomainRealtimeEvent).mock.calls[1][0].userId).toBe('other');
});
test('signout then signin clears deduplication state', () => {
  const view = setup();
  event();
  view.rerender({ id: undefined });
  view.rerender({ id: 'member' });
  event(2);
  expect(handleDomainRealtimeEvent).toHaveBeenCalledTimes(2);
});
test('unmount removes listeners/subscriptions and cancels scheduled reconciliation', () => {
  const view = setup();
  connection('connected');
  connection('connected');
  view.unmount();
  act(() => jest.advanceTimersByTime(1000));
  expect(reconcileAppQueries).not.toHaveBeenCalled();
  expect(removeListener).toHaveBeenCalledTimes(1);
  expect(subscriptions.every((unsubscribe) => unsubscribe.mock.calls.length === 1)).toBe(true);
});
