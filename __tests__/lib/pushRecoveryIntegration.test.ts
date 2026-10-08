import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { AbortController as NativeAbortController } from 'abort-controller';
import { syncPushRegistration } from '../../lib/pushNotifications';
import { awaitRegistration } from '../../lib/pushRegistrationCancellation';
import { notePushRegistrationIncident, hasPendingPushRegistrationIncident, sanitizePushRecoveryLog } from '../../lib/pushRegistrationRecovery';

const mockCommand = jest.fn();
const mockInfo = jest.fn();
const mockNative = jest.fn();
const mockSubscribers = new Set<() => void>();
let mockActor = 'member';
let mockSession = '';
jest.mock('@sentry/react-native', () => ({
  logger: { info: (...args: unknown[]) => mockInfo(...args) },
  getCurrentScope: () => ({ getScopeData: () => ({ attributes: {} }) }),
  getIsolationScope: () => ({ getScopeData: () => ({ attributes: {} }) }),
  getGlobalScope: () => ({ getScopeData: () => ({ attributes: {} }) }),
}));
jest.mock('../../lib/mobileDiagnosticContext', () => ({
  diagnosticSessionIsCurrent: (session: string) => session === mockSession,
  mobileDiagnosticSnapshot: () => ({ session_id: mockSession, installation_id: 'diag:synthetic-installation-123456' }),
  recordDiagnosticOutcome: jest.fn(),
}));
jest.mock('../../stores/useAuthStore', () => ({ useAuthStore: {
  getState: () => ({ session: { user: { id: mockActor } }, profile: { id: mockActor }, setProfile: jest.fn() }),
  subscribe: (callback: () => void) => { mockSubscribers.add(callback); return () => mockSubscribers.delete(callback); },
} }));
jest.mock('../../lib/releaseIdentity', () => ({ mobileReleaseIdentity: () => ({
  platform: require('react-native').Platform.OS, appVersion: '1.0.9',
  nativeBuildNumber: require('react-native').Platform.OS === 'ios' ? '104' : '29', releaseChannel: 'production',
}) }));
jest.mock('../../lib/commandGateway', () => ({ executeCommand: (...args: unknown[]) => mockCommand(...args) }));
jest.mock('../../lib/idempotency', () => ({ newCommandId: () => 'synthetic-installation' }));
jest.mock('../../lib/telemetry', () => ({ recordOperationalFailure: jest.fn(), reportOperationalFailure: jest.fn() }));
jest.mock('../../lib/notificationsModule', () => ({ loadNotificationsModule: async () => ({
  AndroidImportance: { MAX: 5, DEFAULT: 3 }, setNotificationChannelAsync: async () => {},
  getPermissionsAsync: async () => ({ status: 'granted' }),
  getDevicePushTokenAsync: () => mockNative(), getExpoPushTokenAsync: async () => ({ data: 'synthetic-expo-token' }),
}) }));

const EVENT = '1234567890abcdef1234567890abcdef';
const receiptKey = '@doji/push-registration-receipt:v1';
const originalOS = Platform.OS, originalDev = __DEV__, originalAbort = global.AbortController;
let sequence = 0;
let listeners: Set<(state: AppStateStatus) => void>;
function note() { notePushRegistrationIncident('register_native_push_endpoint_v3', EVENT, mockSession); }
function transition(state: AppStateStatus) {
  AppState.currentState = state; [...listeners].forEach(listener => listener(state));
}
async function flush() { for (let n = 0; n < 40; n++) await Promise.resolve(); }
beforeEach(async () => {
  jest.clearAllMocks(); await AsyncStorage.clear();
  jest.useFakeTimers({ now: Date.parse('2026-10-08T00:00:00Z') + ++sequence * 3_600_001 });
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
  global.AbortController = NativeAbortController as unknown as typeof AbortController;
  mockActor = 'member'; mockSession = `diag:synthetic-session-${sequence}-123456`;
  listeners = new Set(); mockSubscribers.clear(); AppState.currentState = 'active';
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    listeners.add(listener); return { remove: () => { listeners.delete(listener); } };
  });
  mockNative.mockReset().mockResolvedValue({ data: 'synthetic-native-token' });
  mockCommand.mockReset().mockResolvedValue({ data: true, error: null });
  expect(hasPendingPushRegistrationIncident()).toBe(false);
});
afterEach(() => {
  expect(listeners.size).toBe(0); expect(mockSubscribers.size).toBe(0);
  Platform.OS = originalOS; global.AbortController = originalAbort;
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = originalDev;
  jest.restoreAllMocks(); jest.useRealTimers();
});

describe.each(['ios', 'android'] as const)('%s registration/recovery integration (native and network boundaries mocked)', platform => {
  beforeEach(() => { Platform.OS = platform; });
  test('failed command then confirmed registration correlates exactly once and sanitizes the actual log', async () => {
    mockCommand.mockImplementationOnce(() => {
      note(); return { data: null, error: { status: 504, code: 'GATEWAY_TIMEOUT', message: 'synthetic' } };
    });
    await expect(syncPushRegistration()).rejects.toMatchObject({ status: 504 });
    expect(mockInfo).not.toHaveBeenCalled(); expect(await AsyncStorage.getItem(receiptKey)).toBeNull();
    jest.advanceTimersByTime(4500);
    expect(await syncPushRegistration()).toBe(true);
    expect(mockInfo).toHaveBeenCalledTimes(1);
    const [message, attributes] = mockInfo.mock.calls[0];
    expect(attributes).toMatchObject({ failure_event_id: EVENT, recovery_elapsed_ms: 4500,
      platform, native_build: platform === 'ios' ? '104' : '29', acknowledgement: 'server_confirmed' });
    const sanitized = sanitizePushRecoveryLog({ level: 'info', message, attributes } as never);
    expect(sanitized?.attributes).toEqual(attributes);
    expect(JSON.stringify(sanitized)).not.toMatch(/synthetic-native-token|synthetic-expo-token|member/);
    expect(await syncPushRegistration()).toBe(true);
    expect(mockCommand).toHaveBeenCalledTimes(2); expect(mockInfo).toHaveBeenCalledTimes(1);
  });
  test('an existing receipt cannot stand in for a new confirmed recovery', async () => {
    expect(await syncPushRegistration()).toBe(true); note();
    mockCommand.mockResolvedValueOnce({ data: false, error: null });
    await expect(syncPushRegistration()).rejects.toThrow('not confirmed');
    expect(mockInfo).not.toHaveBeenCalled(); expect(hasPendingPushRegistrationIncident()).toBe(true);
    expect(await syncPushRegistration()).toBe(true);
    expect(mockCommand).toHaveBeenCalledTimes(3); expect(mockInfo).toHaveBeenCalledTimes(1);
  });
  test('late success after background does not log recovery; foreground acknowledgement does', async () => {
    note(); let finish!: (result: { data: boolean; error: null }) => void;
    const remote = new Promise<{ data: boolean; error: null }>(resolve => { finish = resolve; });
    mockCommand.mockImplementationOnce((_name, _args, account) => awaitRegistration(remote, account.registrationSignal));
    const work = syncPushRegistration(); await flush(); transition('background');
    expect(await work).toBe(false); finish({ data: true, error: null }); await flush();
    expect(mockInfo).not.toHaveBeenCalled(); expect(await AsyncStorage.getItem(receiptKey)).toBeNull();
    transition('active'); expect(await syncPushRegistration()).toBe(true);
    expect(mockInfo).toHaveBeenCalledTimes(1);
  });
  test('account change cancels hung token work and cannot correlate across sessions', async () => {
    note(); let finish!: (token: { data: string }) => void;
    mockNative.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const work = syncPushRegistration(); await flush();
    mockActor = 'next'; mockSession = `diag:next-session-${sequence}-123456`;
    [...mockSubscribers].forEach(callback => callback());
    expect(await work).toBe(false); finish({ data: 'obsolete-token' }); await flush();
    expect(mockCommand).not.toHaveBeenCalled();
    expect(await syncPushRegistration()).toBe(true); expect(mockInfo).not.toHaveBeenCalled();
  });
  test('provider token rotation refreshes registration but is not a recovery incident', async () => {
    expect(await syncPushRegistration()).toBe(true);
    mockNative.mockResolvedValue({ data: 'rotated-synthetic-token' });
    expect(await syncPushRegistration()).toBe(true);
    expect(mockCommand).toHaveBeenCalledTimes(2); expect(mockInfo).not.toHaveBeenCalled();
  });
});
