import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { assertBootstrapCurrent, compileBootstrap, verifyBootstrap } from './build-bootstrap.mts';

test('mobile source archive retains the typed Babel config and diagnostic plugins', () => {
  const ignore = readFileSync(new URL('../.easignore', import.meta.url), 'utf8');
  for (const file of [
    'babel.config.cts',
    'plugins/withAndroidReadDiagnostics.cts',
    'plugins/android-read-diagnostics/expoClientPatch.cts',
    'scripts/verify-build-env.mjs',
  ]) {
    assert.ok(ignore.split(/\r?\n/).includes(`!/${file}`), `Mobile archive omits ${file}`);
    assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), `Missing ${file}`);
  }
  assert.ok(!ignore.includes('!/babel.config.js'));
});

test('only exact compiler output qualifies as the preinstall artifact', () => {
  const source = 'const profile: string = "local"; console.log(profile);';
  const output = compileBootstrap(source);
  assert.doesNotMatch(output, /profile: string/);
  assertBootstrapCurrent(source, output);
  assert.throws(() => assertBootstrapCurrent(source, output + '\n'), /Bootstrap drift|bootstrap drift/);
  assert.throws(() => assertBootstrapCurrent(source + '\nconsole.log("changed");', output), /bootstrap drift/);
  assert.equal(verifyBootstrap(), 'scripts/verify-build-env.mjs');
});
const production: NodeJS.ProcessEnv = {
  EAS_BUILD_PROFILE: 'production',
  EXPO_PUBLIC_APP_ENV: 'production',
  EXPO_PUBLIC_SUPABASE_URL: 'https://tvixsmqxotuvyjqzmjla.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-public',
  EXPO_PUBLIC_SENTRY_DSN: 'synthetic-dsn',
  EXPO_PUBLIC_COMMAND_GATEWAY_URL: 'https://doji-orchestrator.faheygs.workers.dev',
  EXPO_PUBLIC_SCALE_READ_URL: 'https://doji-orchestrator.faheygs.workers.dev',
  EXPO_PUBLIC_MEDIA_TRANSFORMS_ENABLED: 'true',
  SENTRY_AUTH_TOKEN: 'synthetic-secret-not-a-token',
};
function run(environment: NodeJS.ProcessEnv) {
  const result = spawnSync(process.execPath, ['scripts/verify-build-env.mjs'], {
    encoding: 'utf8',
    env: { SystemRoot: process.env.SystemRoot, ...environment },
    timeout: 5000,
  });
  if (result.error) throw result.error;
  assert.doesNotMatch(result.stdout + result.stderr, /synthetic-secret-not-a-token/);
  return result;
}
test('emitted bootstrap executes without dependencies and preserves environment gates', () => {
  assert.equal(run({}).status, 0);
  assert.equal(run({ EAS_BUILD_PROFILE: 'preview' }).status, 0);
  assert.equal(run(production).status, 0);
  for (const [name, value] of [
    ['EXPO_PUBLIC_SUPABASE_ANON_KEY', ''],
    ['EXPO_PUBLIC_API_URL', 'retired'],
    ['EXPO_PUBLIC_APP_ENV', 'development'],
    ['EXPO_PUBLIC_MEDIA_TRANSFORMS_ENABLED', 'false'],
    ['EXPO_PUBLIC_SUPABASE_URL', 'https://wrong.invalid'],
    ['EXPO_PUBLIC_SUPABASE_URL', 'not a url'],
    ['EXPO_PUBLIC_COMMAND_GATEWAY_URL', 'http://doji-orchestrator.faheygs.workers.dev'],
    ['EXPO_PUBLIC_SCALE_READ_URL', 'https://wrong.invalid'],
    ['EXPO_PUBLIC_SCALE_READ_URL', 'not a url'],
  ] as const) {
    const result = run({ ...production, [name]: value });
    assert.equal(result.status, 1, name);
    assert.match(result.stderr, /Unsafe production build environment/);
    assert.ok(result.stderr.includes(name));
  }
});
