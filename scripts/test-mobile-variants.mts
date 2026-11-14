import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { MobileEnvironmentPolicy } from '../plugins/mobileEnvironment.cts';
const require = createRequire(import.meta.url);
const policy: MobileEnvironmentPolicy = require('../plugins/mobileEnvironment.cts');
const config: import('../app.config.ts').MobileAppConfig = require('../app.config.ts');
const base = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo;
const valid = {
  EAS_BUILD_PROFILE: 'staging',
  DOJI_APP_VARIANT: 'staging',
  DOJI_STAGING_BUILD_NUMBER: '1',
  EXPO_PUBLIC_APP_ENV: 'staging',
  EXPO_PUBLIC_SUPABASE_URL: policy.destinations.staging.database,
  EXPO_PUBLIC_COMMAND_GATEWAY_URL: policy.destinations.staging.worker,
  EXPO_PUBLIC_SCALE_READ_URL: policy.destinations.staging.worker,
  EXPO_PUBLIC_MEDIA_TRANSFORMS_ENABLED: 'false',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: `header.${Buffer.from(JSON.stringify({ role: 'anon', ref: 'ohrcupagdoilkwhecict' })).toString('base64url')}.signature`,
  EXPO_PUBLIC_SENTRY_DSN:
    'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@o123.ingest.us.sentry.io/4512328707342336',
  SENTRY_AUTH_TOKEN: 'synthetic-build-only-secret',
};
function resolved(env: NodeJS.ProcessEnv) {
  const previous = process.env;
  try {
    process.env = env;
    return config({
      config: structuredClone(base),
      projectRoot: process.cwd(),
      staticConfigPath: null,
      packageJsonPath: null,
    });
  } finally {
    process.env = previous;
  }
}

test('production is unchanged; local defaults cannot select production identity', () => {
  assert.deepEqual(resolved({ DOJI_APP_VARIANT: 'production' }), base);
  assert.equal(resolved({}).name, 'Doji Dev');
  assert.throws(() => resolved({ EXPO_PUBLIC_APP_ENV: 'production' }), /Unsafe staging/);
  for (const [profile, variant] of [
    ['development', 'development'],
    ['preview', 'staging'],
    ['staging', 'staging'],
  ]) {
    const result = resolved({ ...valid, EAS_BUILD_PROFILE: profile, DOJI_APP_VARIANT: variant });
    const suffix = variant === 'development' ? 'development' : 'staging';
    assert.equal(result.ios?.bundleIdentifier, `com.doit.challengeapp.${suffix}`);
    assert.equal(result.android?.package, result.ios?.bundleIdentifier);
    assert.notEqual(result.scheme, base.scheme);
    assert.equal(result.android?.googleServicesFile, undefined);
    assert.equal(result.updates?.enabled, false);
    assert.deepEqual(result.extra?.eas, base.extra.eas);
    assert.ok(JSON.stringify(result.plugins).includes('doji-staging'));
    assert.ok(!JSON.stringify(result.plugins).includes('"project":"react-native"'));
  }
});

test('profile, destination, public key, Sentry and signing mismatches fail without values', () => {
  policy.validateStagingEnvironment(valid, true);
  assert.throws(() => policy.variantFor({ EAS_BUILD_PROFILE: 'other' }));
  assert.throws(() =>
    policy.variantFor({ EAS_BUILD_PROFILE: 'staging', DOJI_APP_VARIANT: 'production' }),
  );
  for (const [key, value] of [
    ['EXPO_PUBLIC_APP_ENV', 'production'],
    ['EXPO_PUBLIC_SUPABASE_URL', policy.destinations.production.database],
    ['EXPO_PUBLIC_COMMAND_GATEWAY_URL', policy.destinations.production.worker],
    ['EXPO_PUBLIC_SCALE_READ_URL', `${policy.destinations.staging.worker}?secret=do-not-log`],
    ['EXPO_PUBLIC_SUPABASE_ANON_KEY', 'sb_secret_do-not-log'],
    [
      'EXPO_PUBLIC_SUPABASE_ANON_KEY',
      `header.${Buffer.from(JSON.stringify({ role: 'service_role', ref: 'ohrcupagdoilkwhecict' })).toString('base64url')}.signature`,
    ],
    [
      'EXPO_PUBLIC_SENTRY_DSN',
      'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@o123.ingest.us.sentry.io/123',
    ],
    ['EXPO_PUBLIC_SENTRY_DSN', 'not-a-dsn'],
    ['EXPO_PUBLIC_MEDIA_TRANSFORMS_ENABLED', 'true'],
    ['EXPO_PUBLIC_STAGING_PUSH_ENABLED', 'yes'],
    ['EXPO_PUBLIC_WORKFLOW_REPORTING_ENABLED', 'yes'],
    ['EXPO_PUBLIC_AUTH_TOKEN', 'do-not-log'],
    ['DOJI_STAGING_BUILD_NUMBER', '0'],
    ['DOJI_STAGING_BUILD_NUMBER', '2147483648'],
  ])
    assert.throws(
      () => policy.validateStagingEnvironment({ ...valid, [key!]: value }, true),
      (error) => {
        assert.match(String(error), /Unsafe staging/);
        assert.ok(String(error).includes(key!));
        assert.ok(!String(error).includes('do-not-log'));
        return true;
      },
    );
  assert.throws(() =>
    policy.validateStagingEnvironment({ ...valid, EXPO_PUBLIC_STAGING_PUSH_ENABLED: 'true' }, true),
  );
  policy.validateStagingEnvironment(
    {
      ...valid,
      EXPO_PUBLIC_STAGING_PUSH_ENABLED: 'true',
      EXPO_PUBLIC_APNS_ENVIRONMENT: 'production',
    },
    true,
  );
  assert.throws(() =>
    policy.validateStagingEnvironment(
      {
        ...valid,
        EXPO_PUBLIC_STAGING_PUSH_ENABLED: 'true',
        EXPO_PUBLIC_APNS_ENVIRONMENT: 'sandbox',
      },
      true,
    ),
  );
});

test('Android refuses production or mixed app Firebase files', () => {
  const directory = mkdtempSync(join(tmpdir(), 'doji-mobile-config-test-'));
  const file = join(directory, 'firebase.json');
  try {
    const env = {
      ...valid,
      EAS_BUILD_PLATFORM: 'android',
      DOJI_STAGING_FIREBASE_PROJECT_ID: 'synthetic-staging',
    };
    assert.throws(() => resolved(env), /separate staging/);
    assert.throws(() =>
      resolved({ ...env, DOJI_STAGING_GOOGLE_SERVICES_FILE: './google-services.json' }),
    );
    for (const packageName of ['com.doit.challengeapp', 'com.doit.challengeapp.staging']) {
      writeFileSync(
        file,
        JSON.stringify({
          project_info: { project_id: 'synthetic-staging' },
          client: [{ client_info: { android_client_info: { package_name: packageName } } }],
        }),
      );
      const configure = () => resolved({ ...env, DOJI_STAGING_GOOGLE_SERVICES_FILE: file });
      if (packageName.endsWith('.staging'))
        assert.equal(configure().android?.googleServicesFile, file);
      else assert.throws(configure, /identity/);
    }
    assert.throws(
      () =>
        resolved({
          ...env,
          DOJI_STAGING_GOOGLE_SERVICES_FILE: file,
          DOJI_STAGING_FIREBASE_PROJECT_ID: 'doji-connect',
        }),
      /separately verified/,
    );
    assert.throws(
      () =>
        resolved({
          ...env,
          DOJI_STAGING_GOOGLE_SERVICES_FILE: file,
          DOJI_STAGING_FIREBASE_PROJECT_ID: 'mismatched-project',
        }),
      /separately verified/,
    );
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test('committed EAS profiles resolve staging bindings while public config omits build secrets', () => {
  const profiles = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8')).build;
  for (const name of ['development', 'preview', 'staging']) {
    const profile = profiles[name];
    const inherited = profile.extends ? profiles[profile.extends] : {};
    const effective = { ...inherited, ...profile, env: { ...inherited.env, ...profile.env } };
    const env = { ...valid, ...effective.env, EAS_BUILD_PROFILE: name };
    assert.equal(effective.node, '24.18.0');
    assert.equal(effective.distribution, 'internal');
    assert.equal(effective.environment, name === 'development' ? 'development' : 'preview');
    assert.equal(effective.env.EXPO_PUBLIC_STAGING_PUSH_ENABLED, 'false');
    assert.equal(effective.env.EXPO_PUBLIC_WORKFLOW_REPORTING_ENABLED, 'false');
    policy.validateStagingEnvironment(env, true);
    const result = resolved({ ...env, SENTRY_AUTH_TOKEN: undefined });
    assert.ok(!JSON.stringify(result).includes('synthetic-build-only-secret'));
    assert.equal(result.extra?.dojiVariant, name === 'development' ? 'development' : 'staging');
  }
});

test('Android diagnostics bind only to the selected environment and reject mixed regeneration', () => {
  const plugin = require('../plugins/withAndroidReadDiagnostics.cts') as {
    instrumentMainApplication(source: string, language: string, environment?: string): string;
  };
  const input = 'super.onCreate()';
  const staging = plugin.instrumentMainApplication(input, 'kt', 'staging');
  assert.match(staging, /ohrcupagdoilkwhecict/);
  assert.match(staging, /doji-orchestrator-staging/);
  assert.doesNotMatch(staging, /tvixsmqxotuvyjqzmjla/);
  assert.equal(plugin.instrumentMainApplication(staging, 'kt', 'staging'), staging);
  assert.throws(() => plugin.instrumentMainApplication(staging, 'kt', 'production'));
  assert.throws(() => plugin.instrumentMainApplication(input, 'kt', 'unknown'));
  assert.match(plugin.instrumentMainApplication(input, 'kt'), /tvixsmqxotuvyjqzmjla/);
});
