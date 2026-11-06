import { signupOptions } from '../../lib/signupOptions';
import { legalAcceptanceMetadata } from '../../lib/legal';

let mockConfig: { extra?: { dojiVariant?: string }; scheme?: string | string[] } | undefined;
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockConfig;
    },
  },
}));
const original = { ...process.env };
const acceptedAt = '2026-11-05T12:00:00Z';
afterEach(() => {
  for (const key of ['EXPO_PUBLIC_APP_ENV', 'EXPO_PUBLIC_SUPABASE_URL']) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
  mockConfig = undefined;
});
test.each(['production', 'development', undefined])(
  'preserves existing non-staging signup: %s',
  (environment) => {
    if (environment) process.env.EXPO_PUBLIC_APP_ENV = environment;
    else delete process.env.EXPO_PUBLIC_APP_ENV;
    expect(signupOptions(acceptedAt, null)).toEqual({
      data: { ...legalAcceptanceMetadata(acceptedAt), birth_date: null },
    });
  },
);
test.each([
  ['development', 'doji-dev'],
  ['staging', 'doji-staging'],
])('returns to the correct installed variant: %s', (variant, scheme) => {
  process.env.EXPO_PUBLIC_APP_ENV = 'staging';
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://ohrcupagdoilkwhecict.supabase.co';
  mockConfig = { extra: { dojiVariant: variant }, scheme };
  expect(signupOptions(acceptedAt, '1990-01-01')).toEqual({
    data: { ...legalAcceptanceMetadata(acceptedAt), birth_date: '1990-01-01' },
    emailRedirectTo: `${scheme}://login`,
  });
});
test.each([
  undefined,
  {},
  { extra: {} },
  { extra: { dojiVariant: 'production' }, scheme: 'doit' },
  { extra: { dojiVariant: 'development' }, scheme: 'doji-staging' },
  { extra: { dojiVariant: 'staging' }, scheme: ['doji-staging', 'doit'] },
])('rejects absent or mixed native bindings', (config) => {
  process.env.EXPO_PUBLIC_APP_ENV = 'staging';
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://ohrcupagdoilkwhecict.supabase.co';
  mockConfig = config;
  expect(() => signupOptions(acceptedAt, '1990-01-01')).toThrow('not configured');
});
test('rejects a different database before signup', () => {
  process.env.EXPO_PUBLIC_APP_ENV = 'staging';
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://other.example.test';
  mockConfig = { extra: { dojiVariant: 'staging' }, scheme: 'doji-staging' };
  expect(() => signupOptions(acceptedAt, '1990-01-01')).toThrow('not configured');
});
