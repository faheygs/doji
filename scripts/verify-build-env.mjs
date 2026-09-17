const profile = process.env.EAS_BUILD_PROFILE;

if (profile !== 'production') {
  console.log(`Production environment guard skipped for profile: ${profile ?? 'local'}`);
  process.exit(0);
}

const contract = {
  appEnv: 'production',
  supabaseHost: 'tvixsmqxotuvyjqzmjla.supabase.co',
  workerHost: 'doji-orchestrator.faheygs.workers.dev',
};

const required = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_SENTRY_DSN',
  'EXPO_PUBLIC_COMMAND_GATEWAY_URL',
  'EXPO_PUBLIC_SCALE_READ_URL',
  'EXPO_PUBLIC_MEDIA_TRANSFORMS_ENABLED',
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
const invalid = [];

if (process.env.EXPO_PUBLIC_APP_ENV !== contract.appEnv) {
  invalid.push(`EXPO_PUBLIC_APP_ENV must be ${contract.appEnv}`);
}
if (process.env.EXPO_PUBLIC_MEDIA_TRANSFORMS_ENABLED !== 'true') {
  invalid.push('EXPO_PUBLIC_MEDIA_TRANSFORMS_ENABLED must be true');
}
for (const name of ['EXPO_PUBLIC_COMMAND_GATEWAY_URL', 'EXPO_PUBLIC_SCALE_READ_URL']) {
  const value = process.env[name]?.trim();
  if (!value) continue;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') invalid.push(`${name} must use https`);
    if (url.hostname !== contract.workerHost) {
      invalid.push(`${name} must target ${contract.workerHost}`);
    }
  } catch {
    invalid.push(`${name} must be a valid URL`);
  }
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
if (supabaseUrl) {
  try {
    const url = new URL(supabaseUrl);
    if (url.protocol !== 'https:' || url.hostname !== contract.supabaseHost) {
      invalid.push(`EXPO_PUBLIC_SUPABASE_URL must target ${contract.supabaseHost}`);
    }
  } catch {
    invalid.push('EXPO_PUBLIC_SUPABASE_URL must be a valid URL');
  }
}

if (missing.length || stale.length || invalid.length) {
  const parts = [];
  if (missing.length) parts.push(`missing: ${missing.join(', ')}`);
  if (stale.length) parts.push(`retired variables present: ${stale.join(', ')}`);
  if (invalid.length) parts.push(`invalid: ${invalid.join(', ')}`);
  throw new Error(`Unsafe production build environment (${parts.join('; ')})`);
}

console.log('Production build environment verified.');
