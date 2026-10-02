import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  ensureAndroidNotificationChannel,
  syncPushRegistration,
  unregisterCurrentPushInstallation,
  requestPushPermissionAndRegisterToken,
} from '../../lib/pushNotifications';
import { recordOperationalFailure, reportOperationalFailure } from '../../lib/telemetry';

const mockCommand = jest.fn();
const mockSetProfile = jest.fn();
const mockNotifications = {
  AndroidImportance: { MAX: 5, DEFAULT: 3 },
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getDevicePushTokenAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
};
let mockState: {
  session: { user: { id: string } } | null;
  profile: { id: string; notification_token: string | null } | null;
  setProfile: typeof mockSetProfile;
};
jest.mock('../../lib/commandGateway', () => ({
  executeCommand: (...args: unknown[]) => mockCommand(...args),
}));
jest.mock('../../lib/idempotency', () => ({ newCommandId: () => 'synthetic-installation' }));
jest.mock('../../stores/useAuthStore', () => ({ useAuthStore: { getState: () => mockState } }));
jest.mock('../../lib/notificationsModule', () => ({
  loadNotificationsModule: async () => mockNotifications,
}));
jest.mock('../../lib/releaseIdentity', () => ({
  mobileReleaseIdentity: () => ({
    appVersion: '1.0.8',
    nativeBuildNumber: '23',
    releaseChannel: 'production',
  }),
}));
jest.mock('../../lib/telemetry', () => ({
  recordOperationalFailure: jest.fn(),
  reportOperationalFailure: jest.fn(),
}));
jest.mock('expo-constants', () => ({
  expoConfig: { extra: { eas: { projectId: 'synthetic-project' } } },
}));

const installationKey = '@doji/push-installation-id';
const receiptKey = '@doji/push-registration-receipt:v1';
const originalPlatform = Platform.OS;
const originalEnvironment = process.env.EXPO_PUBLIC_APP_ENV;
const originalConfig = Constants.expoConfig;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  Platform.OS = 'android';
  process.env.EXPO_PUBLIC_APP_ENV = 'production';
  Constants.expoConfig = originalConfig;
  mockState = {
    session: { user: { id: 'member' } },
    profile: { id: 'member', notification_token: null },
    setProfile: mockSetProfile,
  };
  mockCommand.mockReset().mockResolvedValue({ data: true, error: null });
  mockNotifications.setNotificationChannelAsync.mockReset().mockResolvedValue(undefined);
  mockNotifications.getPermissionsAsync.mockReset().mockResolvedValue({ status: 'granted' });
  mockNotifications.requestPermissionsAsync.mockReset().mockResolvedValue({ status: 'granted' });
  mockNotifications.getDevicePushTokenAsync.mockReset().mockResolvedValue({ data: 'native-token' });
  mockNotifications.getExpoPushTokenAsync.mockReset().mockResolvedValue({ data: ' expo-token ' });
});
afterEach(() => {
  jest.restoreAllMocks();
  Platform.OS = originalPlatform;
  Constants.expoConfig = originalConfig;
  if (originalEnvironment === undefined) delete process.env.EXPO_PUBLIC_APP_ENV;
  else process.env.EXPO_PUBLIC_APP_ENV = originalEnvironment;
});

test('web permission and registration make no provider or command calls', async () => {
  Platform.OS = 'web';
  await expect(syncPushRegistration()).resolves.toBe(false);
  await expect(requestPushPermissionAndRegisterToken()).resolves.toBe('unsupported');
  await unregisterCurrentPushInstallation();
  await ensureAndroidNotificationChannel();
  expect(mockNotifications.getPermissionsAsync).not.toHaveBeenCalled();
  expect(mockCommand).not.toHaveBeenCalled();
});
test('no member session does not register; denied permission does not fetch tokens', async () => {
  mockState.session = null;
  await expect(syncPushRegistration()).resolves.toBe(false);
  mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'denied' });
  await expect(syncPushRegistration('member')).resolves.toBe(false);
  expect(mockNotifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
  expect(mockCommand).not.toHaveBeenCalled();
});
test('Android creates the existing four channels before asking the OS for permission', async () => {
  await syncPushRegistration();
  expect(mockNotifications.setNotificationChannelAsync.mock.calls.map(([name]) => name)).toEqual([
    'doji-live',
    'direct-activity',
    'reviews-account',
    'doji-alerts',
  ]);
  expect(mockNotifications.setNotificationChannelAsync).toHaveBeenCalledWith(
    'doji-live',
    expect.objectContaining({
      importance: 5,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    }),
  );
  expect(mockNotifications.setNotificationChannelAsync.mock.invocationCallOrder[3]).toBeLessThan(
    mockNotifications.getPermissionsAsync.mock.invocationCallOrder[0],
  );
  expect(mockCommand).toHaveBeenCalledWith('register_native_push_endpoint_v3', {
    p_installation_id: 'synthetic-installation',
    p_token: 'native-token',
    p_platform: 'android',
    p_environment: 'production',
    p_expo_token: 'expo-token',
    p_notification_contract_version: 2,
    p_app_version: '1.0.8',
    p_native_build_number: '23',
    p_release_channel: 'production',
  });
});
test('iOS uses its native token and sandbox environment without Android channel calls', async () => {
  Platform.OS = 'ios';
  delete process.env.EXPO_PUBLIC_APP_ENV;
  Constants.expoConfig = null;
  mockNotifications.getDevicePushTokenAsync.mockResolvedValue({ data: { token: 'native-object' } });
  mockNotifications.getExpoPushTokenAsync.mockResolvedValue({ data: '  ' });
  await expect(syncPushRegistration()).resolves.toBe(true);
  expect(mockNotifications.setNotificationChannelAsync).not.toHaveBeenCalled();
  expect(mockNotifications.getExpoPushTokenAsync).toHaveBeenCalledWith(undefined);
  expect(mockCommand).toHaveBeenCalledWith(
    'register_native_push_endpoint_v3',
    expect.objectContaining({
      p_token: '{"token":"native-object"}',
      p_environment: 'sandbox',
      p_platform: 'ios',
      p_expo_token: null,
    }),
  );
  expect(mockSetProfile).not.toHaveBeenCalled();
});
test('Expo fallback failure does not discard a valid native endpoint', async () => {
  const error = Error('Expo unavailable');
  mockNotifications.getExpoPushTokenAsync.mockRejectedValueOnce(error);
  await expect(syncPushRegistration()).resolves.toBe(true);
  expect(mockCommand).toHaveBeenCalledWith(
    'register_native_push_endpoint_v3',
    expect.objectContaining({ p_expo_token: null, p_token: 'native-token' }),
  );
  expect(recordOperationalFailure).toHaveBeenCalledWith('push', 'expo-token-fallback', error);
});
test('empty native token is not registered and never produces a receipt', async () => {
  mockNotifications.getDevicePushTokenAsync.mockResolvedValue({ data: '' });
  await expect(syncPushRegistration()).rejects.toThrow('did not return a native push token');
  expect(mockCommand).not.toHaveBeenCalled();
  expect(await AsyncStorage.getItem(receiptKey)).toBeNull();
});
test.each(['DOJI_COMMAND_404', 'PGRST202'])(
  'missing v3/v2 contract %s falls back in order with unchanged endpoint identity',
  async (code) => {
    mockCommand
      .mockResolvedValueOnce({ data: null, error: { code } })
      .mockResolvedValueOnce({ data: null, error: { code } });
    await expect(syncPushRegistration()).resolves.toBe(true);
    expect(mockCommand.mock.calls.map(([name]) => name)).toEqual([
      'register_native_push_endpoint_v3',
      'register_native_push_endpoint_v2',
      'register_native_push_endpoint',
    ]);
    expect(mockCommand.mock.calls[1][1]).toMatchObject({
      p_notification_contract_version: 2,
      p_token: 'native-token',
    });
    expect(mockCommand.mock.calls[2][1]).not.toHaveProperty('p_notification_contract_version');
  },
);
test('a successful v2 fallback stops before v1', async () => {
  mockCommand.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } });
  await expect(syncPushRegistration()).resolves.toBe(true);
  expect(mockCommand).toHaveBeenCalledTimes(2);
});
test('authorization failure never falls back to an older registration contract', async () => {
  const error = { code: '42501', message: 'Denied' };
  mockCommand.mockResolvedValueOnce({ data: null, error });
  await expect(syncPushRegistration()).rejects.toBe(error);
  expect(mockCommand).toHaveBeenCalledTimes(1);
  expect(await AsyncStorage.getItem(receiptKey)).toBeNull();
});
test.each([false, null])('unconfirmed result %s cannot create a success receipt', async (data) => {
  mockCommand.mockResolvedValueOnce({ data, error: null });
  await expect(syncPushRegistration()).rejects.toThrow('not confirmed');
  expect(await AsyncStorage.getItem(receiptKey)).toBeNull();
  expect(mockSetProfile).not.toHaveBeenCalled();
});
test.each(['not json', '{}', '{"fingerprint":42,"registeredAt":5}'])(
  'malformed receipt %s is removed and registration is performed',
  async (raw) => {
    await AsyncStorage.setItem(receiptKey, raw);
    await syncPushRegistration();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(receiptKey);
    expect(mockCommand).toHaveBeenCalledTimes(1);
  },
);
test('receipt persistence failure does not reverse a confirmed registration', async () => {
  await AsyncStorage.setItem(installationKey, 'existing-installation');
  const error = Error('storage full');
  jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(error);
  await expect(syncPushRegistration()).resolves.toBe(true);
  expect(recordOperationalFailure).toHaveBeenCalledWith(
    'push',
    'registration-receipt-persist',
    error,
  );
});
test.each(['other', 'same', 'missing'])(
  'profile update does not overwrite %s profile state',
  async (kind) => {
    mockState.profile =
      kind === 'missing'
        ? null
        : {
            id: kind === 'other' ? 'another-member' : 'member',
            notification_token: kind === 'same' ? 'expo-token' : null,
          };
    await syncPushRegistration();
    await syncPushRegistration();
    expect(mockCommand).toHaveBeenCalledTimes(1);
    expect(mockSetProfile).not.toHaveBeenCalled();
  },
);
test('cached confirmed endpoint refreshes only the current profile token', async () => {
  await syncPushRegistration();
  mockSetProfile.mockClear();
  await syncPushRegistration();
  expect(mockCommand).toHaveBeenCalledTimes(1);
  expect(mockSetProfile).toHaveBeenCalledWith({ id: 'member', notification_token: 'expo-token' });
});
test('unregister without installation only clears the registration receipt', async () => {
  await unregisterCurrentPushInstallation();
  expect(AsyncStorage.removeItem).toHaveBeenCalledWith(receiptKey);
  expect(mockCommand).not.toHaveBeenCalled();
});
test('unregister uses the exact installation and tolerates missing cached profile', async () => {
  await AsyncStorage.setItem(installationKey, 'installed');
  mockState.profile = null;
  await unregisterCurrentPushInstallation();
  expect(mockCommand).toHaveBeenCalledWith('unregister_push_installation', {
    p_installation_id: 'installed',
    p_expo_token: null,
  });
});
test('unregister propagates command failure even when local receipt removal fails', async () => {
  await AsyncStorage.setItem(installationKey, 'installed');
  mockState.profile!.notification_token = 'old-expo';
  jest.spyOn(AsyncStorage, 'removeItem').mockRejectedValueOnce(Error('local storage'));
  const error = { code: 'server_failure' };
  mockCommand.mockResolvedValueOnce({ data: null, error });
  await expect(unregisterCurrentPushInstallation()).rejects.toBe(error);
  expect(mockCommand).toHaveBeenCalledWith('unregister_push_installation', {
    p_installation_id: 'installed',
    p_expo_token: 'old-expo',
  });
});
test('sign-out during native acquisition prevents registering the stale endpoint', async () => {
  const token = deferred<{ data: string }>();
  const entered = deferred<void>();
  mockNotifications.getDevicePushTokenAsync.mockImplementationOnce(() => {
    entered.resolve();
    return token.promise;
  });
  const pending = syncPushRegistration();
  await entered.promise;
  const logout = unregisterCurrentPushInstallation();
  token.resolve({ data: 'old-native' });
  await expect(pending).resolves.toBe(false);
  await logout;
  expect(mockCommand).not.toHaveBeenCalled();
});
test('sign-out serializes after an in-flight commit and prevents a stale receipt/profile update', async () => {
  const result = deferred<{ data: boolean; error: null }>();
  const entered = deferred<void>();
  mockCommand.mockImplementationOnce(() => {
    entered.resolve();
    return result.promise;
  });
  const pending = syncPushRegistration();
  await entered.promise;
  const logout = unregisterCurrentPushInstallation();
  result.resolve({ data: true, error: null });
  await expect(pending).resolves.toBe(false);
  await logout;
  expect(mockCommand.mock.calls.map(([name]) => name)).toEqual([
    'register_native_push_endpoint_v3',
    'unregister_push_installation',
  ]);
  expect(await AsyncStorage.getItem(receiptKey)).toBeNull();
  expect(mockSetProfile).not.toHaveBeenCalled();
});
test.each(['denied', 'undetermined'])(
  'OS permission %s remains distinct from a registration failure',
  async (status) => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    mockNotifications.requestPermissionsAsync.mockResolvedValue({ status });
    await expect(requestPushPermissionAndRegisterToken()).resolves.toBe(status);
    expect(mockCommand).not.toHaveBeenCalled();
    expect(reportOperationalFailure).not.toHaveBeenCalled();
  },
);
test('permission grant registers once; existing grant does not prompt again', async () => {
  mockNotifications.getPermissionsAsync.mockResolvedValueOnce({ status: 'undetermined' });
  await expect(requestPushPermissionAndRegisterToken()).resolves.toBe('granted');
  await expect(requestPushPermissionAndRegisterToken()).resolves.toBe('granted');
  expect(mockNotifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(mockCommand).toHaveBeenCalledTimes(1);
});
test('token acquisition failure is reported as error, not permission denial', async () => {
  const error = Error('provider unavailable');
  mockNotifications.getDevicePushTokenAsync.mockRejectedValueOnce(error);
  await expect(requestPushPermissionAndRegisterToken()).resolves.toBe('error');
  expect(reportOperationalFailure).toHaveBeenCalledWith(
    'push',
    'permission-or-registration',
    error,
  );
});
