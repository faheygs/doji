import AsyncStorage from '@react-native-async-storage/async-storage';

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

describe('native push registration', () => {
  beforeEach(async () => {
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
});
