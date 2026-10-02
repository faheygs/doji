import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { mobileReleaseIdentity, sentryReleaseIdentity } from '../../lib/releaseIdentity';
jest.mock('expo-constants', () => ({ __esModule: true, default: {} }));
const originalPlatform = Platform.OS;
const originalChannel = process.env.EXPO_PUBLIC_RELEASE_CHANNEL;
const originalEnv = process.env.EXPO_PUBLIC_APP_ENV;
beforeEach(() => {
  Object.assign(Constants, { nativeAppVersion: null, nativeBuildVersion: null, expoConfig: null });
  Platform.OS = 'ios';
  delete process.env.EXPO_PUBLIC_RELEASE_CHANNEL;
  delete process.env.EXPO_PUBLIC_APP_ENV;
});
afterEach(() => {
  Platform.OS = originalPlatform;
  if (originalChannel === undefined) delete process.env.EXPO_PUBLIC_RELEASE_CHANNEL;
  else process.env.EXPO_PUBLIC_RELEASE_CHANNEL = originalChannel;
  if (originalEnv === undefined) delete process.env.EXPO_PUBLIC_APP_ENV;
  else process.env.EXPO_PUBLIC_APP_ENV = originalEnv;
});
test.each(['ios', 'android', 'web', 'windows'] as const)(
  'missing native/config values are explicitly unknown on %s',
  (platform) => {
    Platform.OS = platform;
    expect(mobileReleaseIdentity()).toEqual({
      appVersion: null,
      nativeBuildNumber: null,
      platform: platform === 'windows' ? 'web' : platform,
      releaseChannel: 'development',
    });
    expect(sentryReleaseIdentity()).toEqual({});
  },
);
test.each([
  ['ios', '101', 'app.ios'],
  ['android', '23', 'app.android'],
  ['web', null, 'doji-web'],
] as const)('uses platform-specific config fallback on %s', (platform, build, id) => {
  Platform.OS = platform;
  Object.assign(Constants, {
    expoConfig: {
      version: ' 1.0.8 ',
      ios: { buildNumber: '101', bundleIdentifier: 'app.ios' },
      android: { versionCode: 23, package: 'app.android' },
      slug: 'doji-web',
    },
  });
  expect(mobileReleaseIdentity()).toMatchObject({ appVersion: '1.0.8', nativeBuildNumber: build });
  expect(sentryReleaseIdentity()).toEqual({ release: `${id}@1.0.8`, dist: build ?? undefined });
});
test('native identity wins over configuration and is normalized', () => {
  Object.assign(Constants, {
    nativeAppVersion: ' 2.0.0 ',
    nativeBuildVersion: ' 104 ',
    expoConfig: { version: '1.0.8', ios: { buildNumber: '101' } },
  });
  expect(sentryReleaseIdentity()).toEqual({ release: 'doji@2.0.0', dist: '104' });
});
test.each([
  ['production', 'production'],
  [' Preview ', 'preview'],
  ['test', 'development'],
  ['', 'development'],
] as const)(
  'app environment %p selects %s without an explicit channel',
  (environment, expected) => {
    process.env.EXPO_PUBLIC_APP_ENV = environment;
    expect(mobileReleaseIdentity().releaseChannel).toBe(expected);
  },
);
test('explicit normalized channel overrides environment, but blank channel does not', () => {
  process.env.EXPO_PUBLIC_APP_ENV = 'production';
  process.env.EXPO_PUBLIC_RELEASE_CHANNEL = ' CLOSED-ALPHA ';
  expect(mobileReleaseIdentity().releaseChannel).toBe('closed-alpha');
  process.env.EXPO_PUBLIC_RELEASE_CHANNEL = ' ';
  expect(mobileReleaseIdentity().releaseChannel).toBe('production');
});
test.each(['', '   ', {}, false])(
  'malformed native identity %p is not fabricated from stale config',
  (value) => {
    Object.assign(Constants, {
      nativeAppVersion: value,
      nativeBuildVersion: value,
      expoConfig: { version: 'old' },
    });
    expect(mobileReleaseIdentity()).toMatchObject({ appVersion: null, nativeBuildNumber: null });
    expect(sentryReleaseIdentity()).toEqual({});
  },
);
test.each(['ios', 'android', 'web'] as const)(
  'missing app identifier on %s uses the stable product fallback',
  (platform) => {
    Platform.OS = platform;
    Object.assign(Constants, { nativeAppVersion: 2, nativeBuildVersion: 0 });
    expect(sentryReleaseIdentity()).toEqual({ release: 'doji@2', dist: '0' });
  },
);
