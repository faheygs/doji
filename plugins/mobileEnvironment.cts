// Build-time policy only; no credentials or provider calls belong here.
type Environment = Readonly<Record<string, string | undefined>>;
type Variant = 'development' | 'staging' | 'production';

const destinations = {
  staging: {
    database: 'https://ohrcupagdoilkwhecict.supabase.co',
    worker: 'https://doji-orchestrator-staging.faheygs.workers.dev',
    sentryProject: '4512328707342336',
  },
  production: {
    database: 'https://tvixsmqxotuvyjqzmjla.supabase.co',
    worker: 'https://doji-orchestrator.faheygs.workers.dev',
    sentryProject: '',
  },
} as const;

function variantFor(env: Environment): Variant {
  const profile = env.EAS_BUILD_PROFILE;
  const expected = profile === 'preview' ? 'staging' : profile;
  const variant = env.DOJI_APP_VARIANT || expected || 'development';
  if (
    !['development', 'staging', 'production'].includes(variant) ||
    (expected && expected !== variant)
  )
    throw Error('Invalid mobile variant/profile pairing');
  return variant as Variant;
}

function validateStagingEnvironment(env: Environment, required: boolean): void {
  const invalid = new Set<string>();
  const target = destinations.staging;
  if (
    required &&
    (!/^[1-9]\d{0,9}$/.test(env.DOJI_STAGING_BUILD_NUMBER || '') ||
      Number(env.DOJI_STAGING_BUILD_NUMBER) > 2147483647)
  )
    invalid.add('DOJI_STAGING_BUILD_NUMBER');
  const exact: Record<string, string> = {
    EXPO_PUBLIC_APP_ENV: 'staging',
    EXPO_PUBLIC_SUPABASE_URL: target.database,
    EXPO_PUBLIC_COMMAND_GATEWAY_URL: target.worker,
    EXPO_PUBLIC_SCALE_READ_URL: target.worker,
    EXPO_PUBLIC_MEDIA_TRANSFORMS_ENABLED: 'false',
  };
  for (const [key, value] of Object.entries(exact))
    if ((required || env[key] !== undefined) && env[key] !== value) invalid.add(key);
  const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (required || key) {
    try {
      const payload = JSON.parse(
        Buffer.from((key || '').split('.')[1] || '', 'base64url').toString(),
      ) as Record<string, unknown>;
      // This is a configuration fence, not signature verification. Supabase owns auth.
      if (payload.role !== 'anon' || payload.ref !== 'ohrcupagdoilkwhecict')
        invalid.add('EXPO_PUBLIC_SUPABASE_ANON_KEY');
    } catch {
      invalid.add('EXPO_PUBLIC_SUPABASE_ANON_KEY');
    }
  }
  const dsn = env.EXPO_PUBLIC_SENTRY_DSN;
  if (required || dsn) {
    try {
      const url = new URL(dsn || '');
      if (
        url.protocol !== 'https:' ||
        !/^o\d+\.ingest\.(?:(?:us|de)\.)?sentry\.io$/.test(url.hostname) ||
        !/^[a-f0-9]{32}$/.test(url.username) ||
        url.password ||
        url.port ||
        url.search ||
        url.hash ||
        url.pathname !== `/${target.sentryProject}`
      )
        invalid.add('EXPO_PUBLIC_SENTRY_DSN');
    } catch {
      invalid.add('EXPO_PUBLIC_SENTRY_DSN');
    }
  }
  for (const key of ['EXPO_PUBLIC_STAGING_PUSH_ENABLED', 'EXPO_PUBLIC_WORKFLOW_REPORTING_ENABLED'])
    if (env[key] !== undefined && !['true', 'false'].includes(env[key]!)) invalid.add(key);
  if (
    env.EXPO_PUBLIC_WORKFLOW_REPORTING_ENABLED === 'true' &&
    env.EXPO_PUBLIC_WORKFLOW_REPORTING_ENVIRONMENT !== 'staging'
  )
    invalid.add('EXPO_PUBLIC_WORKFLOW_REPORTING_ENVIRONMENT');
  if (
    env.EXPO_PUBLIC_STAGING_PUSH_ENABLED === 'true' &&
    (!['sandbox', 'production'].includes(env.EXPO_PUBLIC_APNS_ENVIRONMENT || '') ||
      (required && env.EXPO_PUBLIC_APNS_ENVIRONMENT !== 'production'))
  )
    invalid.add('EXPO_PUBLIC_APNS_ENVIRONMENT');
  for (const key of Object.keys(env))
    if (
      key.startsWith('EXPO_PUBLIC_') &&
      /SECRET|SERVICE_ROLE|AUTH_TOKEN|PRIVATE_KEY|PASSWORD/.test(key) &&
      env[key]
    )
      invalid.add(key);
  if (invalid.size)
    throw Error(`Unsafe staging build environment: ${[...invalid].sort().join(', ')}`);
}

module.exports = { destinations, variantFor, validateStagingEnvironment };
export type MobileEnvironmentPolicy = {
  destinations: typeof destinations;
  variantFor: typeof variantFor;
  validateStagingEnvironment: typeof validateStagingEnvironment;
};
