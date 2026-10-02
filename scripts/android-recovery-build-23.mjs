// Android-only, owner-approved recovery/diagnostic release. Never retries launch.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const cliRoot = 'C:/Users/gfahe/AppData/Roaming/npm/node_modules/eas-cli';
const cli = `${cliRoot}/bin/run`;
const root = resolve('test-results/android-recovery-23');
const candidate = resolve(root, 'upload');
const json = p => JSON.parse(readFileSync(p, 'utf8'));
const hash = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const save = (name, data) => writeFileSync(resolve(root, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2), { flag: 'wx' });
const walk = (dir, prefix = '') => readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  assert.ok(!e.isSymbolicLink());
  return e.isDirectory() ? walk(resolve(dir, e.name), prefix + e.name + '/') : [prefix + e.name];
});
const allowed = new Set(['app', 'assets', 'components', 'constants', 'contexts', 'contracts', 'hooks', 'lib', 'stores', 'types', 'utils', 'scripts', 'app.json', 'babel.config.js', 'eas.json', 'google-services.json', 'index.ts', 'package.json', 'package-lock.json', 'tsconfig.json', '.easignore']);
const required = ['lib/memberReadDiagnostics.ts', 'lib/apiQueryCache.ts', 'lib/apiFailureTelemetry.ts', 'lib/supabaseFetch.ts', 'lib/requestSignal.ts', 'lib/scaleReadGateway.ts', 'lib/rpcQueryError.ts', 'lib/queryClient.ts', 'components/profile/ProfileSubmissions.tsx', 'components/ui/ReadFailureFeedback.tsx', 'components/notifications/NotificationSheet.tsx', 'hooks/useNotificationCenter.ts', 'app/(app)/(tabs)/friends.tsx', 'app/(app)/(tabs)/profile.tsx', 'app/(app)/(tabs)/rank.tsx', 'app/(app)/(tabs)/index.tsx', 'app/(app)/profile/shop.tsx'];
function verify() {
  const m = json(resolve(root, 'manifest.json'));
  assert.deepEqual(walk(candidate).sort(), Object.keys(m.files).sort());
  for (const [f, h] of Object.entries(m.files)) {
    assert.equal(hash(resolve(candidate, f)), h, `Candidate drift: ${f}`);
    assert.equal(hash(resolve(f)), h, `Workspace drift: ${f}`);
  }
  const app = json(resolve(candidate, 'app.json')).expo;
  const eas = json(resolve(candidate, 'eas.json'));
  assert.equal(app.version, '1.0.8');
  assert.equal(app.ios.buildNumber, '101');
  assert.equal(app.android.versionCode, 23);
  assert.equal(app.android.package, 'com.doit.challengeapp');
  assert.equal(app.extra.eas.projectId, '064b68b6-f138-4962-8aeb-f00970ba39c8');
  assert.equal(eas.build.production.android.resourceClass, 'medium');
  assert.equal(eas.build.production.autoIncrement, false);
  assert.equal(eas.submit.production.android.track, 'alpha');
  for (const f of required) assert.ok(m.files[f], f);
  return m;
}
const mode = process.argv[2];
mkdirSync(root, { recursive: true });
if (mode === 'prepare') {
  assert.ok(!existsSync(candidate), 'Preserve existing candidate');
  const ignore = await require(`${cliRoot}/build/vcs/local.js`).Ignore.createForCopyingAsync(resolve('.'));
  function copy(prefix = '') {
    for (const e of readdirSync(resolve(prefix || '.'), { withFileTypes: true })) {
      const f = prefix + e.name;
      if (ignore.ignores(f)) continue;
      assert.ok(!e.isSymbolicLink(), f);
      if (e.isDirectory()) copy(f + '/');
      else { mkdirSync(dirname(resolve(candidate, f)), { recursive: true }); copyFileSync(f, resolve(candidate, f)); }
    }
  }
  copy();
  const files = Object.fromEntries(walk(candidate).sort().map(f => {
    assert.ok(allowed.has(f.split('/')[0]), `Unexpected upload path ${f}`);
    assert.ok(!/(^|\/)\.env|\.(?:pem|key|p8|p12|jks|mobileprovision)$/.test(f), `Secret-like path ${f}`);
    if (f.startsWith('scripts/')) assert.equal(f, 'scripts/verify-build-env.mjs');
    return [f, hash(resolve(candidate, f))];
  }));
  save('manifest.json', { at: new Date().toISOString(), version: '1.0.8', android: 23, iosUnchanged: 101, files, required });
  const previous = json('test-results/mobile-release-101-22/manifest.json').files;
  const changed = Object.keys(files).filter(f => previous[f] !== files[f]);
  const removed = Object.keys(previous).filter(f => !files[f]);
  save('changes-from-22.json', { changed, removed });
  verify(); console.log(JSON.stringify({ verified: true, files: Object.keys(files).length, changed, removed }));
} else if (mode === 'verify') {
  console.log(JSON.stringify({ verified: true, files: Object.keys(verify().files).length }));
} else if (mode === 'bundle') {
  verify();
  require('@expo/env').load(resolve('.'), { silent: true });
  const env = { ...process.env, ...json('eas.json').build.production.env, CI: '1', SENTRY_DISABLE_AUTO_UPLOAD: 'true' };
  const output = execFileSync(process.execPath, ['node_modules/expo/bin/cli', 'export', '--platform', 'android', '--output-dir', resolve(root, 'bundle-android'), '--no-bytecode', '--max-workers', '2'], { env, encoding: 'utf8', timeout: 600000, maxBuffer: 6e6 });
  save('bundle-android.log', output); verify(); console.log('Android production JavaScript bundle validated.');
} else if (mode === 'launch') {
  verify(); assert.equal(process.argv[3], '--approved');
  assert.ok(existsSync(resolve(root, 'bundle-android/metadata.json')));
  const credit = json(resolve(root, 'cost-preflight.json'));
  assert.ok(credit.remainingCredit >= credit.buildCredit + credit.delayedUsageReserve);
  assert.equal(credit.additionalSpend, 0);
  assert.ok(Date.now() - Date.parse(credit.at) < 3600000, 'Refresh cost check');
  const tests = json('test-results/android-23-regression.json');
  assert.equal(tests.success, true); assert.equal(tests.numFailedTests, 0); assert.ok(tests.numPassedTests >= 1255);
  assert.ok(!existsSync(resolve(root, 'android-attempt.json')), 'Never repeat an ambiguous launch');
  const history = JSON.parse(execFileSync(process.execPath, [cli, 'build:list', '--platform', 'android', '--limit', '10', '--json', '--non-interactive'], { cwd: candidate, encoding: 'utf8', timeout: 60000 }));
  assert.ok(history.every(b => Number(b.appBuildVersion) < 23), 'Build already used');
  assert.ok(history.every(b => ['FINISHED', 'ERRORED', 'CANCELED'].includes(b.status)), 'Active build exists');
  save('android-history.json', history.map(b => ({ id: b.id, status: b.status, build: b.appBuildVersion, createdAt: b.createdAt })));
  save('android-attempt.json', { at: new Date().toISOString(), platform: 'android', build: 23, destination: 'Existing Google Play Closed testing Alpha; submit exact artifact after completion' });
  const args = [cli, 'build', '--platform', 'android', '--profile', 'production', '--freeze-credentials', '--non-interactive', '--no-wait', '--json', '--message', 'Android 23: bounded request correlation and read-recovery feedback; underlying 504 cause not yet confirmed; Alpha tester release'];
  try {
    const raw = execFileSync(process.execPath, args, { cwd: candidate, env: { ...process.env, EAS_NO_VCS: '1', EAS_PROJECT_ROOT: candidate }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 600000, maxBuffer: 8e6 });
    const builds = JSON.parse(raw).map(b => ({ id: b.id, status: b.status, platform: b.platform, appVersion: b.appVersion, appBuildVersion: b.appBuildVersion, url: `https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/${b.id}` }));
    assert.equal(builds.length, 1); assert.equal(builds[0].platform, 'ANDROID');
    save('android-build.json', builds); console.log(JSON.stringify(builds));
  } catch (e) {
    save('android-launch-error.txt', String(e.stdout ?? '') + '\n' + String(e.message));
    console.error('Inspect exact EAS jobs before any retry; launch marker retained.'); process.exitCode = 1;
  }
} else throw new Error('Use prepare, verify, bundle, or launch --approved');
