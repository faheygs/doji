import { act, cleanup, renderHook } from '@testing-library/react-native';
import { AppState, InteractionManager, Platform, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { NotificationResponse } from 'expo-notifications';
import { useNativeNotifications } from '../../hooks/useNativeNotifications';

const mockSync = jest.fn();
const mockUnregister = jest.fn();
const mockSetProfile = jest.fn();
const mockReport = jest.fn();
const mockRecord = jest.fn();
const mockCommand = jest.fn();
const mockRouter = { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() };
let mockNavigation: { key: string } | undefined;
let mockUser: string | undefined;
let mockProfile: Record<string, unknown> | null;
const mockState = () => ({
  session: mockUser ? { user: { id: mockUser } } : null,
  profile: mockProfile,
  setProfile: mockSetProfile,
});
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: Object.assign((select: (state: unknown) => unknown) => select(mockState()), {
    getState: () => mockState(),
  }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useRootNavigationState: () => mockNavigation,
}));
jest.mock('../../lib/pushNotifications', () => ({
  syncPushRegistration: (...args: unknown[]) => mockSync(...args),
  unregisterCurrentPushInstallation: (...args: unknown[]) => mockUnregister(...args),
}));
jest.mock('../../lib/telemetry', () => ({
  reportOperationalFailure: (...args: unknown[]) => mockReport(...args),
  recordOperationalFailure: (...args: unknown[]) => mockRecord(...args),
}));
jest.mock('../../lib/commandGateway', () => ({
  executeCommand: (...args: unknown[]) => mockCommand(...args),
}));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(),
  clearLastNotificationResponseAsync: jest.fn(),
}));
let onState: (state: AppStateStatus) => void;
let onResponse: (response: NotificationResponse | null | undefined) => void;
let afterNavigation: (() => void)[];
const removeState = jest.fn();
const removeResponses = jest.fn();
const originalOS = Platform.OS;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
}
function response(
  data: unknown,
  identifier: string | undefined = 'native-id',
): NotificationResponse {
  return { notification: { request: { identifier, content: { data } } } } as NotificationResponse;
}
async function settle() {
  await act(async () => {});
}
async function navigate() {
  await act(async () => jest.advanceTimersByTime(0));
}
beforeEach(() => {
  jest.useFakeTimers({ now: Date.parse('2026-10-02T00:00:00Z') });
  jest.clearAllMocks();
  Platform.OS = 'android';
  mockUser = 'member';
  mockProfile = { id: 'member', is_banned: false };
  mockNavigation = { key: 'root' };
  afterNavigation = [];
  mockSync.mockReset().mockResolvedValue(true);
  mockUnregister.mockReset().mockResolvedValue(undefined);
  mockCommand.mockReset().mockResolvedValue({ data: null, error: null });
  for (const fn of Object.values(mockRouter)) fn.mockReset();
  jest
    .mocked(Notifications.getPermissionsAsync)
    .mockReset()
    .mockResolvedValue({ status: 'granted' } as Notifications.NotificationPermissionsStatus);
  jest.mocked(Notifications.getLastNotificationResponseAsync).mockReset().mockResolvedValue(null);
  jest.mocked(Notifications.clearLastNotificationResponseAsync).mockReset().mockResolvedValue();
  jest
    .mocked(Notifications.addNotificationResponseReceivedListener)
    .mockImplementation((callback) => {
      onResponse = callback as typeof onResponse;
      return { remove: removeResponses };
    });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    onState = callback;
    return { remove: removeState };
  });
  jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((task) => {
    if (typeof task === 'function') afterNavigation.push(task);
    return { cancel: jest.fn(), then: jest.fn(), done: jest.fn() } as ReturnType<
      typeof InteractionManager.runAfterInteractions
    >;
  });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
  Platform.OS = originalOS;
  jest.restoreAllMocks();
});

test('web mounts no native push lifecycle or response listeners', async () => {
  Platform.OS = 'web';
  renderHook(() => useNativeNotifications(true));
  await settle();
  expect(Notifications.setNotificationHandler).not.toHaveBeenCalled();
  expect(AppState.addEventListener).not.toHaveBeenCalled();
  expect(Notifications.addNotificationResponseReceivedListener).not.toHaveBeenCalled();
  expect(mockSync).not.toHaveBeenCalled();
});
test('native foreground presentation remains silent and registration happens on foreground, not background', async () => {
  const { unmount } = renderHook(() => useNativeNotifications(true));
  await settle();
  const handler = jest.mocked(Notifications.setNotificationHandler).mock.calls[0][0];
  expect(await handler?.handleNotification({} as Notifications.Notification)).toEqual({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: false,
    shouldShowList: false,
  });
  expect(mockSync).toHaveBeenCalledWith('member');
  act(() => onState('background'));
  await settle();
  expect(mockSync).toHaveBeenCalledTimes(1);
  act(() => onState('active'));
  await settle();
  expect(mockSync).toHaveBeenCalledTimes(2);
  unmount();
  expect(removeState).toHaveBeenCalledTimes(1);
  expect(removeResponses).toHaveBeenCalledTimes(1);
});
test.each(['signed out', 'missing profile', 'different profile'])(
  'registration waits for an authorized owner profile: %s',
  async (state) => {
    if (state === 'signed out') mockUser = undefined;
    else mockProfile = state === 'missing profile' ? null : { id: 'other' };
    renderHook(() => useNativeNotifications(false));
    await settle();
    expect(mockSync).not.toHaveBeenCalled();
    expect(AppState.addEventListener).not.toHaveBeenCalled();
  },
);
test.each([{ is_banned: true }, { notification_preferences: { push_enabled: false } }])(
  'disabled push unregisters and clears only the profile token (%j)',
  async (fields) => {
    mockProfile = { id: 'member', notification_token: 'old', ...fields };
    renderHook(() => useNativeNotifications(true));
    await settle();
    expect(mockUnregister).toHaveBeenCalledTimes(1);
    expect(mockSetProfile).toHaveBeenCalledWith({ ...mockProfile, notification_token: null });
    expect(mockSync).not.toHaveBeenCalled();
  },
);
test.each(['unmount', 'profile disappears'])(
  'late unregister does not recreate a disposed profile: %s',
  async (change) => {
    mockProfile = { id: 'member', is_banned: true };
    const pending = deferred<void>();
    mockUnregister.mockReturnValue(pending.promise);
    const { unmount } = renderHook(() => useNativeNotifications(true));
    if (change === 'unmount') unmount();
    else mockProfile = null;
    await act(async () => pending.resolve());
    expect(mockSetProfile).not.toHaveBeenCalled();
  },
);
test('denied OS permissions never request a token or prompt again', async () => {
  jest
    .mocked(Notifications.getPermissionsAsync)
    .mockResolvedValue({ status: 'denied' } as Notifications.NotificationPermissionsStatus);
  renderHook(() => useNativeNotifications(true));
  await settle();
  expect(mockSync).not.toHaveBeenCalled();
  expect(mockReport).not.toHaveBeenCalled();
});
test('permission response after unmount cannot start registration', async () => {
  const pending = deferred<Notifications.NotificationPermissionsStatus>();
  jest.mocked(Notifications.getPermissionsAsync).mockReturnValue(pending.promise);
  const { unmount } = renderHook(() => useNativeNotifications(true));
  await settle();
  unmount();
  await act(async () =>
    pending.resolve({ status: 'granted' } as Notifications.NotificationPermissionsStatus),
  );
  expect(mockSync).not.toHaveBeenCalled();
});
test('a newer foreground sync supersedes the older permission request', async () => {
  const pending = deferred<Notifications.NotificationPermissionsStatus>();
  jest.mocked(Notifications.getPermissionsAsync).mockReturnValueOnce(pending.promise);
  renderHook(() => useNativeNotifications(true));
  await settle();
  act(() => onState('active'));
  await settle();
  expect(mockSync).toHaveBeenCalledTimes(1);
  await act(async () =>
    pending.resolve({ status: 'granted' } as Notifications.NotificationPermissionsStatus),
  );
  expect(mockSync).toHaveBeenCalledTimes(1);
});
test('permanent registration errors are reported without retry loops', async () => {
  const failure = new Error('invalid provider configuration');
  mockSync.mockRejectedValue(failure);
  renderHook(() => useNativeNotifications(true));
  await settle();
  expect(mockReport).toHaveBeenCalledWith('push', 'endpoint-registration', failure);
  expect(mockSync).toHaveBeenCalledTimes(1);
  expect(mockRecord).not.toHaveBeenCalled();
});
test('transient token failure retries on the bounded policy and records the attempt', async () => {
  const failure = new Error(
    'Fetching the token failed: java.io.IOException: SERVICE_NOT_AVAILABLE',
  );
  mockSync.mockRejectedValueOnce(failure).mockResolvedValue(true);
  renderHook(() => useNativeNotifications(true));
  await settle();
  expect(mockRecord).toHaveBeenCalledWith('push', 'endpoint-registration-retry', failure, {
    attempt: 1,
  });
  await act(async () => jest.advanceTimersByTime(60_000));
  expect(mockSync).toHaveBeenCalledTimes(2);
  expect(mockReport).not.toHaveBeenCalled();
});
test('a late native failure after unmount is not reported as an active session incident', async () => {
  const pending = deferred<Notifications.NotificationPermissionsStatus>();
  jest.mocked(Notifications.getPermissionsAsync).mockReturnValue(pending.promise);
  const { unmount } = renderHook(() => useNativeNotifications(true));
  await settle();
  unmount();
  await act(async () => pending.reject(new Error('late')));
  expect(mockReport).not.toHaveBeenCalled();
});
test('unmount before the native module resolves attaches no response listener', async () => {
  const { unmount } = renderHook(() => useNativeNotifications(true));
  unmount();
  await settle();
  expect(Notifications.addNotificationResponseReceivedListener).not.toHaveBeenCalled();
});
test('rejected cold-start lookup does not disable the live response listener', async () => {
  jest
    .mocked(Notifications.getLastNotificationResponseAsync)
    .mockRejectedValue(new Error('no response'));
  renderHook(() => useNativeNotifications(true));
  await settle();
  act(() => onResponse(response({ type: 'CHALLENGE' })));
  await navigate();
  expect(mockRouter.push).toHaveBeenCalledWith('/(app)/challenge');
});
test('a cold-start response arriving after unmount is ignored', async () => {
  const pending = deferred<NotificationResponse | null>();
  jest.mocked(Notifications.getLastNotificationResponseAsync).mockReturnValue(pending.promise);
  const { unmount } = renderHook(() => useNativeNotifications(true));
  await settle();
  unmount();
  await act(async () => pending.resolve(response({ type: 'CHALLENGE' })));
  await navigate();
  expect(mockRouter.push).not.toHaveBeenCalled();
});
test.each([null, undefined, {}, { url: 'https://evil.invalid/' }])(
  'invalid or absent push data never navigates (%j)',
  async (data) => {
    renderHook(() => useNativeNotifications(true));
    await settle();
    act(() => {
      onResponse(null);
      onResponse(undefined);
      onResponse(response(data));
    });
    await navigate();
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockCommand).not.toHaveBeenCalled();
  },
);
test('notification tap waits for app access and navigator readiness, then marks attention after navigation settles', async () => {
  mockNavigation = undefined;
  const data = {
    type: 'CHALLENGE',
    eventId: 'event',
    notificationScopeKind: 'daily_event',
    notificationScopeId: 'day',
  };
  jest.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValue(response(data));
  const { rerender } = renderHook(
    ({ ready }: { ready: boolean }) => useNativeNotifications(ready),
    { initialProps: { ready: false } },
  );
  await settle();
  await navigate();
  expect(mockRouter.push).not.toHaveBeenCalled();
  rerender({ ready: true });
  await navigate();
  expect(mockRouter.push).not.toHaveBeenCalled();
  mockNavigation = { key: 'root' };
  rerender({ ready: true });
  await navigate();
  expect(mockRouter.push).toHaveBeenCalledWith('/(app)/challenge');
  expect(mockCommand).not.toHaveBeenCalled();
  expect(Notifications.clearLastNotificationResponseAsync).toHaveBeenCalledTimes(1);
  await act(async () => afterNavigation.forEach((callback) => callback()));
  expect(mockCommand).toHaveBeenCalledWith('mark_notification_attention_seen', {
    p_receipts: [
      { scope_kind: 'daily_event', scope_id: 'day', seen_at: '2026-10-02T00:00:00.000Z' },
    ],
  });
  act(() => onResponse(response(data, 'different-native-id')));
  await navigate();
  expect(mockRouter.push).toHaveBeenCalledTimes(1);
});
test.each([{}, { eventId: '' }])(
  'fallback notification identity deduplicates both pending and consumed responses (%j)',
  async (fields) => {
    const { rerender } = renderHook(
      ({ ready }: { ready: boolean }) => useNativeNotifications(ready),
      { initialProps: { ready: false } },
    );
    await settle();
    const item = response({ type: 'BADGE', ...fields });
    act(() => {
      onResponse(item);
      onResponse(item);
    });
    rerender({ ready: true });
    await navigate();
    act(() => onResponse(item));
    await navigate();
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    await act(async () => afterNavigation.forEach((callback) => callback()));
    expect(mockCommand).not.toHaveBeenCalled();
  },
);
test('navigation failure preserves the durable response rather than acknowledging it', async () => {
  mockRouter.push.mockImplementation(() => {
    throw new Error('not mounted');
  });
  mockRouter.navigate.mockImplementation(() => {
    throw new Error('not mounted');
  });
  mockRouter.replace.mockImplementation(() => {
    throw new Error('not mounted');
  });
  renderHook(() => useNativeNotifications(true));
  await settle();
  act(() => onResponse(response({ type: 'CHALLENGE' })));
  await navigate();
  expect(Notifications.clearLastNotificationResponseAsync).not.toHaveBeenCalled();
  expect(afterNavigation).toHaveLength(0);
  expect(mockCommand).not.toHaveBeenCalled();
});
test('unmount cancels a queued navigation task without acknowledging the push', async () => {
  const { unmount } = renderHook(() => useNativeNotifications(true));
  await settle();
  act(() => onResponse(response({ type: 'CHALLENGE' })));
  unmount();
  await navigate();
  expect(mockRouter.push).not.toHaveBeenCalled();
  expect(Notifications.clearLastNotificationResponseAsync).not.toHaveBeenCalled();
});
