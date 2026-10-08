import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

const mockExecuteCommand = jest.fn();
const mockSetProfile = jest.fn();
const mockGetDevicePushTokenAsync = jest.fn();
const mockGetExpoPushTokenAsync = jest.fn();

jest.mock('../../lib/commandGateway', () => ({
  executeCommand: (...args: unknown[]) => mockExecuteCommand(...args),
}));
jest.mock('../../lib/idempotency', () => ({ newCommandId: () => 'installation-1' }));
jest.mock('../../lib/releaseIdentity', () => ({
  mobileReleaseIdentity: () => ({
    appVersion: '1.0.7',
    nativeBuildNumber: '17',
    platform: 'android',
    releaseChannel: 'production',
  }),
}));
jest.mock('../../lib/telemetry', () => ({
  recordOperationalFailure: jest.fn(),
  reportOperationalFailure: jest.fn(),
}));
jest.mock('../../lib/notificationsModule', () => ({
  loadNotificationsModule: async () => ({
    AndroidImportance: { MAX: 5, DEFAULT: 3 },
    setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
    getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
    getDevicePushTokenAsync: (...args: unknown[]) => mockGetDevicePushTokenAsync(...args),
    getExpoPushTokenAsync: (...args: unknown[]) => mockGetExpoPushTokenAsync(...args),
  }),
}));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: {
    subscribe: () => () => {},
    getState: () => ({
      session: { user: { id: 'user-1' } },
      profile: { id: 'user-1', notification_token: null },
      setProfile: mockSetProfile,
    }),
  },
}));
jest.mock('expo-constants', () => ({
  expoConfig: { extra: { eas: { projectId: 'project-1' } } },
}));
import { syncPushRegistration } from '../../lib/pushNotifications';
import { retryPushRegistration } from '../../lib/retryPushRegistration';

describe('native push registration', () => {
  beforeEach(async () => {
    AppState.currentState = 'active';
    await AsyncStorage.clear();
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    mockGetDevicePushTokenAsync.mockResolvedValue({ data: 'native-token-1' });
    mockGetExpoPushTokenAsync.mockResolvedValue({ data: 'expo-token-1' });
    mockExecuteCommand.mockResolvedValue({ data: true, error: null });
  });

  it('shares concurrent registration work and skips an unchanged recent refresh', async () => {
    const [first, second] = await Promise.all([
      syncPushRegistration('user-1'),
      syncPushRegistration('user-1'),
    ]);
    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(mockExecuteCommand).toHaveBeenCalledTimes(1);

    await expect(syncPushRegistration('user-1')).resolves.toBe(true);
    expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
  });

  it('registers again when the native provider rotates its token', async () => {
    await syncPushRegistration('user-1');
    mockGetDevicePushTokenAsync.mockResolvedValue({ data: 'native-token-2' });

    await expect(syncPushRegistration('user-1')).resolves.toBe(true);
    expect(mockExecuteCommand).toHaveBeenCalledTimes(2);
  });

  it('recovers native token acquisition before registering, without a premature receipt', async () => {
    jest.useFakeTimers();
    try {
      mockGetDevicePushTokenAsync.mockRejectedValueOnce(new Error('Fetching the token failed: java.io.IOException: SERVICE_NOT_AVAILABLE'));
      const pending = retryPushRegistration(() => syncPushRegistration('user-1'), () => false, () => {
        expect(mockExecuteCommand).not.toHaveBeenCalled();
        expect(mockSetProfile).not.toHaveBeenCalled();
        expect(AsyncStorage.setItem).not.toHaveBeenCalled();
      });
      await jest.runAllTimersAsync();
      await expect(pending).resolves.toBe(true);
      expect(mockGetDevicePushTokenAsync).toHaveBeenCalledTimes(2);
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
      expect(mockExecuteCommand).toHaveBeenCalledWith('register_native_push_endpoint_v3', expect.objectContaining({ p_token: 'native-token-1' }), expect.objectContaining({ expectedUserId: 'user-1', registrationSignal: expect.anything() }));
    } finally { jest.useRealTimers(); }
  });

  it('does not erase a working endpoint or receipt when a refresh cannot fetch a token', async () => {
    await syncPushRegistration('user-1');
    const receipt = await AsyncStorage.getItem('@doji/push-registration-receipt:v1');
    mockGetDevicePushTokenAsync.mockRejectedValueOnce(new Error('Fetching the token failed: java.io.IOException: SERVICE_NOT_AVAILABLE'));
    await expect(syncPushRegistration('user-1')).rejects.toThrow('SERVICE_NOT_AVAILABLE');
    expect(await AsyncStorage.getItem('@doji/push-registration-receipt:v1')).toBe(receipt);
    expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
    expect(mockExecuteCommand).not.toHaveBeenCalledWith('unregister_push_installation', expect.anything());
  });
});
