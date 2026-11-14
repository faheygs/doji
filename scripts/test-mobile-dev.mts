import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { developmentEnvironment, externalConfigPath, options } from './mobile-dev.mts';
const require = createRequire(import.meta.url);
const {
  localMetroBlockList,
}: import('../plugins/localMetroPolicy.cts').LocalMetroPolicy = require('../plugins/localMetroPolicy.cts');

test('local watcher excludes retained output/checkouts without excluding app dependencies', () => {
  const blocked = localMetroBlockList('D:\\ChallengeApp\\DoIt');
  assert.equal(blocked.flags, '', 'Expo combines blockList entries with matching flags');
  for (const path of [
    '.claude/worktrees/other/app/index.tsx',
    '.codex-owner-backup-20260824/app/index.tsx',
    '.tmp-codex-repair/file.ts',
    'test-results/copy/app/index.tsx',
    'coverage/report.js',
  ]) {
    assert.ok(blocked.test(`D:/ChallengeApp/DoIt/${path}`), path);
    assert.ok(blocked.test(`D:\\ChallengeApp\\DoIt\\${path.replaceAll('/', '\\')}`), path);
  }
  for (const path of [
    'app/index.tsx',
    'node_modules/expo/index.js',
    'assets/icon.png',
    'lib/cache.ts',
    '.expo/.virtual-metro-entry.js',
  ])
    assert.ok(!blocked.test(`D:/ChallengeApp/DoIt/${path}`), path);
  assert.ok(!blocked.test('D:/ChallengeApp/DoIt-other/.claude/file.ts'));
});

const valid = {
  DOJI_APP_VARIANT: 'development',
  DOJI_STAGING_BUILD_NUMBER: '1',
  EXPO_PUBLIC_RELEASE_CHANNEL: 'development',
  EXPO_PUBLIC_APP_ENV: 'staging',
  EXPO_PUBLIC_SUPABASE_URL: 'https://ohrcupagdoilkwhecict.supabase.co',
  EXPO_PUBLIC_COMMAND_GATEWAY_URL: 'https://doji-orchestrator-staging.faheygs.workers.dev',
  EXPO_PUBLIC_SCALE_READ_URL: 'https://doji-orchestrator-staging.faheygs.workers.dev',
  EXPO_PUBLIC_MEDIA_TRANSFORMS_ENABLED: 'false',
  EXPO_PUBLIC_STAGING_PUSH_ENABLED: 'false',
  EXPO_PUBLIC_WORKFLOW_REPORTING_ENABLED: 'false',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: `header.${Buffer.from(JSON.stringify({ role: 'anon', ref: 'ohrcupagdoilkwhecict' })).toString('base64url')}.signature`,
  EXPO_PUBLIC_SENTRY_DSN:
    'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@o123.ingest.us.sentry.io/4512328707342336',
};

test('local Metro keeps staging bindings and excludes inherited production/build settings', () => {
  const env = developmentEnvironment(
    { ...valid, EAS_BUILD_PLATFORM: 'android' },
    {
      Path: 'synthetic-path',
      SystemRoot: 'synthetic-system',
      EXPO_PUBLIC_SUPABASE_URL: 'https://production.invalid',
      SENTRY_AUTH_TOKEN: 'do-not-log',
      EXPO_TOKEN: 'do-not-log',
      EAS_BUILD_PROFILE: 'production',
      NODE_OPTIONS: '--require unsafe',
    },
  );
  assert.equal(env.Path, 'synthetic-path');
  assert.equal(env.EXPO_PUBLIC_SUPABASE_URL, valid.EXPO_PUBLIC_SUPABASE_URL);
  for (const key of [
    'SENTRY_AUTH_TOKEN',
    'EXPO_TOKEN',
    'EAS_BUILD_PROFILE',
    'EAS_BUILD_PLATFORM',
    'NODE_OPTIONS',
  ])
    assert.equal(env[key], undefined);
  assert.equal(env.EXPO_NO_DOTENV, '1');
  assert.equal(env.SENTRY_DISABLE_AUTO_UPLOAD, 'true');
});

test('wrong variants, enabled delivery/reporting and provider keys fail closed', () => {
  for (const override of [
    { DOJI_APP_VARIANT: 'production' },
    { DOJI_APP_VARIANT: 'staging' },
    { EXPO_PUBLIC_STAGING_PUSH_ENABLED: 'true' },
    { EXPO_PUBLIC_WORKFLOW_REPORTING_ENABLED: 'true' },
    { EXPO_PUBLIC_SUPABASE_URL: 'https://production.invalid' },
    { SENTRY_AUTH_TOKEN: 'do-not-log' },
    { EXPO_PUBLIC_PASSWORD: 'do-not-log' },
  ]) {
    assert.throws(
      () => developmentEnvironment({ ...valid, ...override }, {}),
      (error) => {
        assert.ok(!String(error).includes('do-not-log'));
        return true;
      },
    );
  }
});

test('LAN is explicit and cloud/tunnel commands cannot be forwarded', () => {
  assert.deepEqual(options([]), { lan: false, check: false, envFile: undefined });
  assert.equal(options(['--lan', '--check']).lan, true);
  for (const arg of ['--tunnel', '--production', '--env-file', 'build'])
    assert.throws(() => options([arg]), /Usage/);
});

test('local settings must resolve outside the repository', () => {
  const root = mkdtempSync(join(tmpdir(), 'doji-mobile-dev-test-'));
  try {
    const file = join(root, 'test.env');
    writeFileSync(file, 'SYNTHETIC=true');
    assert.throws(() => externalConfigPath(file, root), /outside/);
    assert.throws(() => externalConfigPath('relative.env', root), /absolute/);
    assert.equal(externalConfigPath(file, join(import.meta.dirname, '..')), file);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
