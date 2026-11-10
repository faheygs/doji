import { inlineCommentPagingEnabled } from '../../lib/inlineCommentFeature';

const original = { ...process.env };
afterEach(() => {
  for (const key of ['EXPO_PUBLIC_APP_ENV', 'EXPO_PUBLIC_RELEASE_CHANNEL', 'EXPO_PUBLIC_SUPABASE_URL']) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});
test.each(['development', 'staging'])('allows only the qualified %s staging binding', (channel) => {
  process.env.EXPO_PUBLIC_APP_ENV = 'staging';
  process.env.EXPO_PUBLIC_RELEASE_CHANNEL = channel;
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://ohrcupagdoilkwhecict.supabase.co';
  expect(inlineCommentPagingEnabled()).toBe(true);
  process.env.EXPO_PUBLIC_APP_ENV = 'production';
  expect(inlineCommentPagingEnabled()).toBe(false);
});
test('rejects missing, mixed-environment and unqualified channel bindings', () => {
  delete process.env.EXPO_PUBLIC_APP_ENV;
  expect(inlineCommentPagingEnabled()).toBe(false);
  process.env.EXPO_PUBLIC_APP_ENV = 'staging';
  process.env.EXPO_PUBLIC_RELEASE_CHANNEL = 'staging';
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://different-project.supabase.co';
  expect(inlineCommentPagingEnabled()).toBe(false);
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://ohrcupagdoilkwhecict.supabase.co';
  process.env.EXPO_PUBLIC_RELEASE_CHANNEL = 'production';
  expect(inlineCommentPagingEnabled()).toBe(false);
});
