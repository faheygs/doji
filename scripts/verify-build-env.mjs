const profile = process.env.EAS_BUILD_PROFILE;

if (profile !== 'production') {
  console.log(`Production environment guard skipped for profile: ${profile ?? 'local'}`);
  process.exit(0);
}

const required = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_SENTRY_DSN',
  'EXPO_PUBLIC_COMMAND_GATEWAY_URL',
  'SENTRY_AUTH_TOKEN',
];
const retired = [
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_SOCKET_URL',
  'EXPO_PUBLIC_R2_PUBLIC_URL',
  'EXPO_PUBLIC_TYPESENSE_HOST',
  'EXPO_PUBLIC_TYPESENSE_SEARCH_KEY',
  'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
];

const missing = required.filter((name) => !process.env[name]?.trim());
const stale = retired.filter((name) => process.env[name]?.trim());

if (process.env.EXPO_PUBLIC_APP_ENV !== 'production') {
  missing.push('EXPO_PUBLIC_APP_ENV=production');
}

if (missing.length || stale.length) {
  const parts = [];
  if (missing.length) parts.push(`missing: ${missing.join(', ')}`);
  if (stale.length) parts.push(`retired variables present: ${stale.join(', ')}`);
  throw new Error(`Unsafe production build environment (${parts.join('; ')})`);
}

console.log('Production build environment verified.');
