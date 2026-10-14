import React from 'react';
import { act, cleanup, render } from '@testing-library/react-native';
import { AppState, Platform } from 'react-native';
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QueryLifecycle } from '../../components/QueryLifecycle';
import { reconcileAppQueries } from '../../lib/reconcileQueries';

let mockUser: string | null = 'member';
let mockAdmin = false;
let mockBanned = false;
const mockFetch = jest.fn();
jest.mock('../../lib/reconcileQueries', () => ({
  reconcileAppQueries: jest.fn(() => Promise.resolve()),
  suspendAppReads: jest.fn(() => Promise.resolve()),
}));
const mockNetworkRemove = jest.fn();
const mockNetworkSnapshot = jest.fn(() => Promise.resolve({ isConnected: true }));
let mockNetworkListener: (state: { isConnected: boolean }) => void;
jest.mock('expo-network', () => ({
  getNetworkStateAsync: () => mockNetworkSnapshot(),
  addNetworkStateListener: (callback: typeof mockNetworkListener) => {
    mockNetworkListener = callback;
    return { remove: mockNetworkRemove };
  },
}));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({
        session: mockUser ? { user: { id: mockUser } } : null,
        profile: { is_admin: mockAdmin, is_banned: mockBanned },
      }),
    { getState: () => ({ fetchProfile: mockFetch, session: mockUser ? { user: { id: mockUser } } : null }) },
  ),
}));
const originalPlatform = Platform.OS;
const remove = jest.fn();
let client: QueryClient;
let listener: (state: string) => void;
let listen: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  mockUser = 'member';
  mockAdmin = false;
  mockBanned = false;
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  mockNetworkSnapshot.mockImplementation(() => Promise.resolve({ isConnected: true }));
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  client = new QueryClient();
  listen = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, callback) => {
    listener = callback as (state: string) => void;
    return { remove };
  });
});
afterEach(() => {
  cleanup();
  client.clear();
  jest.restoreAllMocks();
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
});
function setup() {
  return render(
    <QueryClientProvider client={client}>
      <QueryLifecycle />
    </QueryClientProvider>,
  );
}
test.each(['ios', 'android'])('%s reconciles when foregrounded, not backgrounded', async (os) => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  const focused = jest.spyOn(focusManager, 'setFocused');
  const view = setup();
  expect(focused).toHaveBeenCalledWith(AppState.currentState === 'active');
  act(() => listener('background'));
  expect(focused).toHaveBeenLastCalledWith(false);
  expect(reconcileAppQueries).not.toHaveBeenCalled();
  await act(async () => listener('active'));
  expect(focused).toHaveBeenLastCalledWith(true);
  expect(mockFetch).toHaveBeenCalledWith('member');
  expect(reconcileAppQueries).toHaveBeenCalledWith(client, expect.objectContaining({ userId: 'member', isAdmin: false, force: true }));
  view.unmount();
  expect(remove).toHaveBeenCalledTimes(1);
  expect(mockNetworkRemove).toHaveBeenCalledTimes(1);
});
test('web leaves browser focus management unchanged', () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  setup();
  expect(listen).not.toHaveBeenCalled();
});
test('banned member refreshes account status but does not reconcile member queries', async () => {
  mockBanned = true;
  setup();
  act(() => listener('background'));
  await act(async () => listener('active'));
  expect(mockFetch).toHaveBeenCalledWith('member');
  expect(reconcileAppQueries).not.toHaveBeenCalled();
});
test('signed-out foreground never fetches another account profile', async () => {
  mockUser = null;
  setup();
  act(() => listener('background'));
  await act(async () => listener('active'));
  expect(mockFetch).not.toHaveBeenCalled();
  expect(reconcileAppQueries).toHaveBeenCalledWith(client, expect.objectContaining({ userId: undefined, isAdmin: false }));
});
test('admin role is passed through to authorized reconciliation', async () => {
  mockAdmin = true;
  setup();
  act(() => listener('background'));
  await act(async () => listener('active'));
  expect(reconcileAppQueries).toHaveBeenCalledWith(client, expect.objectContaining({ userId: 'member', isAdmin: true }));
});
test('older snapshot cannot overwrite a newer offline event, nor recover after unmount', async () => {
  let finish!: (state: { isConnected: boolean }) => void;
  mockNetworkSnapshot.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const view = setup();
  act(() => mockNetworkListener({ isConnected: false }));
  await act(async () => finish({ isConnected: true }));
  expect(onlineManager.isOnline()).toBe(false);
  view.unmount();
  await act(async () => mockNetworkListener({ isConnected: true }));
  expect(reconcileAppQueries).not.toHaveBeenCalled();
});
test('old account callback cannot refresh the new account profile', async () => {
  setup();
  act(() => listener('background'));
  mockUser = 'another-member';
  await act(async () => listener('active'));
  expect(mockFetch).not.toHaveBeenCalled();
});
test('role/account rerender retains known offline state until a new observation', async () => {
  const view = setup();
  act(() => mockNetworkListener({ isConnected: false }));
  mockNetworkSnapshot.mockImplementation(() => new Promise(() => {}));
  mockAdmin = true;
  view.rerender(<QueryClientProvider client={client}><QueryLifecycle /></QueryClientProvider>);
  await act(async () => {});
  expect(onlineManager.isOnline()).toBe(false);
  expect(reconcileAppQueries).not.toHaveBeenCalled();
});
test('unavailable OS snapshot retains bounded-read fallback without reporting an outage', async () => {
  mockNetworkSnapshot.mockRejectedValueOnce(new Error('optional module unavailable'));
  setup();
  await act(async () => {});
  expect(onlineManager.isOnline()).toBe(true);
});
