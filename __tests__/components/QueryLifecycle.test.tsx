import React from 'react';
import { act, cleanup, render } from '@testing-library/react-native';
import { AppState, Platform } from 'react-native';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QueryLifecycle } from '../../components/QueryLifecycle';
import { reconcileAppQueries } from '../../lib/reconcileQueries';

let mockUser: string | null = 'member';
let mockAdmin = false;
let mockBanned = false;
const mockFetch = jest.fn();
jest.mock('../../lib/reconcileQueries', () => ({ reconcileAppQueries: jest.fn() }));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({
        session: mockUser ? { user: { id: mockUser } } : null,
        profile: { is_admin: mockAdmin, is_banned: mockBanned },
      }),
    { getState: () => ({ fetchProfile: mockFetch }) },
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
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
});
function setup() {
  return render(
    <QueryClientProvider client={client}>
      <QueryLifecycle />
    </QueryClientProvider>,
  );
}
test.each(['ios', 'android'])('%s reconciles when foregrounded, not backgrounded', (os) => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  const focused = jest.spyOn(focusManager, 'setFocused');
  const view = setup();
  expect(focused).toHaveBeenCalledWith(AppState.currentState === 'active');
  act(() => listener('background'));
  expect(focused).toHaveBeenLastCalledWith(false);
  expect(reconcileAppQueries).not.toHaveBeenCalled();
  act(() => listener('active'));
  expect(focused).toHaveBeenLastCalledWith(true);
  expect(mockFetch).toHaveBeenCalledWith('member');
  expect(reconcileAppQueries).toHaveBeenCalledWith(client, { userId: 'member', isAdmin: false });
  view.unmount();
  expect(remove).toHaveBeenCalledTimes(1);
});
test('web leaves browser focus management unchanged', () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  setup();
  expect(listen).not.toHaveBeenCalled();
});
test('banned member refreshes account status but cannot start member queries', () => {
  mockBanned = true;
  setup();
  act(() => listener('active'));
  expect(mockFetch).toHaveBeenCalledWith('member');
  expect(reconcileAppQueries).not.toHaveBeenCalled();
});
test('signed-out foreground never fetches another account profile', () => {
  mockUser = null;
  setup();
  act(() => listener('active'));
  expect(mockFetch).not.toHaveBeenCalled();
  expect(reconcileAppQueries).toHaveBeenCalledWith(client, { userId: undefined, isAdmin: false });
});
test('admin role is passed through to authorized reconciliation', () => {
  mockAdmin = true;
  setup();
  act(() => listener('active'));
  expect(reconcileAppQueries).toHaveBeenCalledWith(client, { userId: 'member', isAdmin: true });
});
