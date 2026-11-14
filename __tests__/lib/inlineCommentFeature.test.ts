import { inlineCommentPagingEnabled } from '../../lib/inlineCommentFeature';

const original = { ...process.env };
afterEach(() => {
  for (const key of [
    'EXPO_PUBLIC_APP_ENV',
    'EXPO_PUBLIC_RELEASE_CHANNEL',
    'EXPO_PUBLIC_SUPABASE_URL',
  ]) {
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

test('production requires all three exact bindings and missing values fail closed', () => {
  const stagingUrl = 'https://ohrcupagdoilkwhecict.supabase.co';
  const productionUrl = 'https://tvixsmqxotuvyjqzmjla.supabase.co';
  for (const environment of ['', 'staging', 'production', 'preview']) {
    for (const channel of ['', 'development', 'staging', 'production', 'preview']) {
      for (const url of ['', stagingUrl, productionUrl, 'https://different-project.supabase.co']) {
        process.env.EXPO_PUBLIC_APP_ENV = environment;
        process.env.EXPO_PUBLIC_RELEASE_CHANNEL = channel;
        process.env.EXPO_PUBLIC_SUPABASE_URL = url;
        const expected =
          (environment === 'staging' &&
            ['development', 'staging'].includes(channel) &&
            url === stagingUrl) ||
          (environment === 'production' && channel === 'production' && url === productionUrl);
        expect({ environment, channel, url, enabled: inlineCommentPagingEnabled() }).toEqual({
          environment,
          channel,
          url,
          enabled: expected,
        });
      }
    }
  }
});
