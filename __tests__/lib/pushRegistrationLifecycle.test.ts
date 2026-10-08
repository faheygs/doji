import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { syncPushRegistration, requestPushPermissionAndRegisterToken } from '../../lib/pushNotifications';
import { awaitRegistration } from '../../lib/pushRegistrationCancellation';
import { AbortController as NativeAbortController } from 'abort-controller';

const mockCommand = jest.fn();
const mockSetProfile = jest.fn();
const mockReport = jest.fn();
const mockSubscribers = new Set<() => void>();
let mockUser = 'member';
let mockEnabled = true;
const mockNative = jest.fn();
const mockExpo = jest.fn();
const mockRecovery = jest.fn();
const mockPendingIncident = jest.fn();
jest.mock('../../lib/pushRegistrationRecovery', () => ({
  hasPendingPushRegistrationIncident: () => mockPendingIncident(),
  reportPushRegistrationRecovery: () => mockRecovery(),
}));
jest.mock('../../stores/useAuthStore', () => ({ useAuthStore: {
  getState: () => ({ session: { user: { id: mockUser } }, profile: {
    id: mockUser, notification_preferences: { push_enabled: mockEnabled },
  }, setProfile: mockSetProfile }),
  subscribe: (listener: () => void) => { mockSubscribers.add(listener); return () => mockSubscribers.delete(listener); },
} }));
jest.mock('../../lib/commandGateway', () => ({ executeCommand: (...args: unknown[]) => mockCommand(...args) }));
jest.mock('../../lib/telemetry', () => ({ recordOperationalFailure: jest.fn(), reportOperationalFailure: (...args: unknown[]) => mockReport(...args) }));
jest.mock('../../lib/idempotency', () => ({ newCommandId: () => 'local-installation' }));
jest.mock('../../lib/releaseIdentity', () => ({ mobileReleaseIdentity: () => ({ appVersion: '1.0.9', nativeBuildNumber: '104', releaseChannel: 'production' }) }));
jest.mock('../../lib/notificationsModule', () => ({ loadNotificationsModule: async () => ({
  AndroidImportance: { MAX: 5, DEFAULT: 3 }, setNotificationChannelAsync: async () => {},
  getPermissionsAsync: async () => ({ status: 'granted' }),
  getDevicePushTokenAsync: () => mockNative(), getExpoPushTokenAsync: () => mockExpo(),
}) }));
const receiptKey = '@doji/push-registration-receipt:v1';
let listeners: Set<(state: AppStateStatus) => void>;
function transition(state: AppStateStatus) {
  AppState.currentState = state;
  [...listeners].forEach(listener => listener(state));
}
async function flush() { for (let i = 0; i < 40; i++) await Promise.resolve(); }
function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((r, j) => { resolve = r; reject = j; });
  return { promise, resolve, reject };
}
const originalOS = Platform.OS;
const originalAbortController = global.AbortController;
beforeEach(async () => {
  jest.clearAllMocks(); await AsyncStorage.clear();
  global.AbortController = NativeAbortController as unknown as typeof AbortController;
  mockUser = 'member'; mockEnabled = true; Platform.OS = 'ios'; AppState.currentState = 'active';
  listeners = new Set(); mockSubscribers.clear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    listeners.add(listener); return { remove: () => { listeners.delete(listener); } };
  });
  mockNative.mockReset().mockResolvedValue({ data: 'native-token' });
  mockExpo.mockReset().mockResolvedValue({ data: 'expo-token' });
  mockCommand.mockReset().mockResolvedValue({ data: true, error: null });
  mockPendingIncident.mockReset().mockReturnValue(false);
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); Platform.OS = originalOS; global.AbortController = originalAbortController; });

test.each(['ios', 'android'] as const)('%s never starts registration while backgrounded', async os => {
  Platform.OS = os; transition('background');
  expect(await syncPushRegistration()).toBe(false);
  expect(mockNative).not.toHaveBeenCalled(); expect(mockCommand).not.toHaveBeenCalled();
  expect(listeners.size).toBe(0); expect(mockSubscribers.size).toBe(0);
});

test.each(['native', 'expo'])('background interruption releases the queue during a hung %s token request', async stage => {
  const old = pending<{ data: string }>();
  (stage === 'native' ? mockNative : mockExpo).mockReturnValueOnce(old.promise);
  const first = syncPushRegistration(); await flush(); transition('background');
  expect(await first).toBe(false);
  expect(mockCommand).not.toHaveBeenCalled(); expect(await AsyncStorage.getItem(receiptKey)).toBeNull();
  transition('active');
  expect(await syncPushRegistration()).toBe(true);
  old.reject(new Error('late native failure')); await flush();
  expect(mockCommand).toHaveBeenCalledTimes(1); expect(mockSetProfile).toHaveBeenCalledTimes(1);
  expect(mockReport).not.toHaveBeenCalled(); expect(listeners.size).toBe(0);
});

test.each(['account', 'disabled'])('%s change cancels token work before any HTTP dispatch', async change => {
  const token = pending<{ data: string }>(); mockNative.mockReturnValueOnce(token.promise);
  const work = syncPushRegistration(); await flush();
  if (change === 'account') mockUser = 'other'; else mockEnabled = false;
  [...mockSubscribers].forEach(listener => listener());
  expect(await work).toBe(false);
  token.resolve({ data: 'obsolete-token' }); await flush();
  expect(mockCommand).not.toHaveBeenCalled(); expect(mockSetProfile).not.toHaveBeenCalled();
});

test('cancelled HTTP work ignores late success and a fresh run reconciles without a premature receipt', async () => {
  const remote = pending<{ data: boolean; error: null }>();
  mockCommand.mockImplementationOnce((_name, _args, account) => awaitRegistration(remote.promise, account.registrationSignal));
  const work = syncPushRegistration(); await flush();
  expect(mockCommand).toHaveBeenCalledTimes(1);
  transition('background'); expect(await work).toBe(false);
  expect(mockRecovery).not.toHaveBeenCalled();
  expect(await AsyncStorage.getItem(receiptKey)).toBeNull(); expect(mockSetProfile).not.toHaveBeenCalled();
  transition('active'); expect(await syncPushRegistration()).toBe(true);
  remote.resolve({ data: true, error: null }); await flush();
  expect(mockCommand).toHaveBeenCalledTimes(2); expect(mockSetProfile).toHaveBeenCalledTimes(1);
  expect(mockRecovery).toHaveBeenCalledTimes(1);
});

test('pending recovery bypasses an old cache receipt and requires a fresh server acknowledgement', async () => {
  expect(await syncPushRegistration()).toBe(true);
  mockRecovery.mockClear(); mockCommand.mockClear();
  expect(await syncPushRegistration()).toBe(true);
  expect(mockCommand).not.toHaveBeenCalled(); expect(mockRecovery).not.toHaveBeenCalled();
  mockPendingIncident.mockReturnValue(true);
  expect(await syncPushRegistration()).toBe(true);
  expect(mockCommand).toHaveBeenCalledTimes(1); expect(mockRecovery).toHaveBeenCalledTimes(1);
});

test('unconfirmed server response never reports recovery', async () => {
  mockPendingIncident.mockReturnValue(true);
  mockCommand.mockResolvedValue({ data: false, error: null });
  await expect(syncPushRegistration()).rejects.toThrow('not confirmed');
  expect(mockRecovery).not.toHaveBeenCalled();
});

test('explicit permission setup reports interruption as deferred, not denied or granted', async () => {
  const native = pending<{ data: string }>(); mockNative.mockReturnValueOnce(native.promise);
  const work = requestPushPermissionAndRegisterToken(); await flush(); transition('inactive');
  expect(await work).toBe('deferred'); expect(mockReport).not.toHaveBeenCalled();
});

test('explicit opt-in may register while push is disabled, but implicit startup may not', async () => {
  mockEnabled = false;
  expect(await syncPushRegistration()).toBe(false);
  expect(await requestPushPermissionAndRegisterToken()).toBe('granted');
  expect(mockCommand).toHaveBeenCalledTimes(1);
});
