import { nativePushEnvironment, stagingPushDisabled } from '../../lib/mobileStaging';

const original = { ...process.env };
afterEach(() => {
  for (const key of [
    'EXPO_PUBLIC_APP_ENV',
    'EXPO_PUBLIC_STAGING_PUSH_ENABLED',
    'EXPO_PUBLIC_APNS_ENVIRONMENT',
  ]) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

test('staging push defaults off while production behavior is unchanged', () => {
  process.env.EXPO_PUBLIC_APP_ENV = 'staging';
  delete process.env.EXPO_PUBLIC_STAGING_PUSH_ENABLED;
  expect(stagingPushDisabled()).toBe(true);
  process.env.EXPO_PUBLIC_STAGING_PUSH_ENABLED = 'false';
  expect(stagingPushDisabled()).toBe(true);
  process.env.EXPO_PUBLIC_STAGING_PUSH_ENABLED = 'true';
  expect(stagingPushDisabled()).toBe(false);
  process.env.EXPO_PUBLIC_APP_ENV = 'production';
  expect(stagingPushDisabled()).toBe(false);
  expect(nativePushEnvironment()).toBe('production');
  process.env.EXPO_PUBLIC_APP_ENV = 'development';
  expect(nativePushEnvironment()).toBe('sandbox');
});

test('APNs environment describes signing, not which database is used', () => {
  process.env.EXPO_PUBLIC_APP_ENV = 'staging';
  delete process.env.EXPO_PUBLIC_APNS_ENVIRONMENT;
  expect(() => nativePushEnvironment()).toThrow('signing environment');
  for (const environment of ['sandbox', 'production'] as const) {
    process.env.EXPO_PUBLIC_APNS_ENVIRONMENT = environment;
    expect(nativePushEnvironment()).toBe(environment);
  }
  process.env.EXPO_PUBLIC_APNS_ENVIRONMENT = 'staging';
  expect(() => nativePushEnvironment()).toThrow('signing environment');
});
