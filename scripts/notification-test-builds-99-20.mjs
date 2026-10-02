// Owner-approved mobile-only build preparation / one-shot launch. Never retry a marker.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const cliRoot = 'C:/Users/gfahe/AppData/Roaming/npm/node_modules/eas-cli';
const cli = `${cliRoot}/bin/run`;
const root = resolve('test-results/notification-release-99-20');
const candidate = resolve(root, 'upload');
const mode = process.argv[2];
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const walk = (dir, prefix = '') => readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  assert.ok(!e.isSymbolicLink(), `Symlink in upload: ${prefix}${e.name}`);
  return e.isDirectory() ? walk(resolve(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`];
});
function verify() {
  const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
  assert.deepEqual(walk(candidate).sort(), Object.keys(manifest.files).sort());
  for (const [file, expected] of Object.entries(manifest.files)) {
    assert.equal(hash(resolve(candidate, file)), expected, `Candidate drift: ${file}`);
    assert.equal(hash(resolve(file)), expected, `Workspace drift: ${file}`);
  }
  const app = JSON.parse(readFileSync(resolve(candidate, 'app.json'), 'utf8')).expo;
  const eas = JSON.parse(readFileSync(resolve(candidate, 'eas.json'), 'utf8'));
  assert.equal(app.version, '1.0.8');
  assert.equal(app.ios.buildNumber, '99');
  assert.equal(app.android.versionCode, 20);
  assert.equal(app.extra.eas.projectId, '064b68b6-f138-4962-8aeb-f00970ba39c8');
  assert.equal(eas.build.production.ios.resourceClass, 'm-medium');
  assert.equal(eas.build.production.android.resourceClass, 'medium');
  assert.equal(eas.submit.production.ios.ascAppId, '6768727326');
  assert.equal(eas.build.production.autoIncrement, false);
  return manifest;
}
if (mode === 'prepare') {
  assert.ok(!existsSync(candidate), 'Preserve existing candidate; inspect instead of overwriting');
  mkdirSync(root, { recursive: true });
  const ignore = await require(`${cliRoot}/build/vcs/local.js`).Ignore.createForCopyingAsync(resolve('.'));
  const copyInputs = (prefix = '') => {
    for (const entry of readdirSync(resolve(prefix || '.'), { withFileTypes: true })) {
      const file = prefix + entry.name;
      if (ignore.ignores(file)) continue;
      assert.ok(!entry.isSymbolicLink(), `Unexpected source symlink: ${file}`);
      if (entry.isDirectory()) copyInputs(`${file}/`);
      else { mkdirSync(dirname(resolve(candidate, file)), { recursive: true }); copyFileSync(file, resolve(candidate, file)); }
    }
  };
  copyInputs();
  const baseline = JSON.parse(readFileSync('test-results/mobile-release-20260926/retry-manifest.json', 'utf8')).files;
  const files = Object.fromEntries(walk(candidate).sort().map(file => [file, hash(resolve(candidate, file))]));
  assert.deepEqual(Object.keys(files).sort(), [...Object.keys(baseline), 'lib/notificationHistoryQueue.ts'].sort());
  const changed = Object.keys(files).filter(file => files[file] !== baseline[file]).sort();
  assert.deepEqual(changed, ['app.json', 'hooks/useNotificationCenter.ts', 'lib/apiFailureTelemetry.ts',
    'lib/commandGateway.ts', 'lib/notificationHistoryQueue.ts', 'lib/notificationVisibility.ts'].sort());
  const oldApp = JSON.parse(readFileSync('test-results/mobile-release-20260926/upload-r2/app.json', 'utf8'));
  const newApp = JSON.parse(readFileSync(resolve(candidate, 'app.json'), 'utf8'));
  oldApp.expo.ios.buildNumber = '99'; oldApp.expo.android.versionCode = 20;
  assert.deepEqual(newApp, oldApp, 'Only build numbers may change in app config');
  writeFileSync(resolve(root, 'manifest.json'), JSON.stringify({ preparedAt: new Date().toISOString(),
    files, changed, version: '1.0.8', ios: 99, android: 20 }, null, 2));
  verify();
  console.log(JSON.stringify({ verified: true, files: Object.keys(files).length, changed, candidate }, null, 2));
} else if (mode === 'verify') {
  console.log(JSON.stringify({ verified: true, files: Object.keys(verify().files).length }));
} else if (mode === 'ios' || mode === 'android') {
  verify();
  for (const platform of ['ios', 'android']) {
    assert.ok(existsSync(resolve(root, `bundle-${platform}/metadata.json`)), `Missing ${platform} bundle validation`);
  }
  const marker = resolve(root, `${mode}-attempt.json`);
  assert.ok(!existsSync(marker), 'Launch attempted already. Reconcile EAS exact IDs; do not rerun');
  const history = JSON.parse(execFileSync(process.execPath, [cli, 'build:list', '--platform', mode,
    '--limit', '5', '--json', '--non-interactive'], { cwd: candidate, encoding: 'utf8', timeout: 60000 }));
  const next = mode === 'ios' ? 99 : 20;
  assert.ok(history.every(b => Number(b.appBuildVersion) < next), 'Build number already used');
  assert.ok(history.every(b => ['FINISHED', 'ERRORED', 'CANCELED'].includes(b.status)), 'Existing active platform build');
  writeFileSync(resolve(root, `${mode}-prior-builds.json`), JSON.stringify(history.map(b => ({
    id: b.id, platform: b.platform, status: b.status, appBuildVersion: b.appBuildVersion,
  })), null, 2));
  writeFileSync(marker, JSON.stringify({ attemptedAt: new Date().toISOString(), platform: mode, build: next,
    creditCheck: 'Expo dashboard $20 / $45 used; conservative prior-job allowance plus this $3 pair remains included',
    destination: mode === 'ios' ? 'TestFlight via testing submission profile' : 'AAB artifact only; no Play submission',
  }, null, 2));
  const args = [cli, 'build', '--platform', mode, '--profile', 'production', '--freeze-credentials',
    '--non-interactive', '--no-wait', '--json', '--message',
    'Notification history repair: pre-live dismissal, unread, concurrent actions, account guards and Sentry diagnostics; device testing required'];
  if (mode === 'ios') args.push('--auto-submit-with-profile', 'testing');
  try {
    const raw = execFileSync(process.execPath, args, { cwd: candidate,
      env: { ...process.env, EAS_NO_VCS: '1', EAS_PROJECT_ROOT: candidate },
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 600000, maxBuffer: 8 * 1024 * 1024 });
    const builds = JSON.parse(raw).map(b => ({ id: b.id, status: b.status, platform: b.platform,
      appVersion: b.appVersion, appBuildVersion: b.appBuildVersion,
      url: `https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/${b.id}` }));
    writeFileSync(resolve(root, `${mode}-build.json`), JSON.stringify(builds, null, 2));
    console.log(JSON.stringify(builds, null, 2));
  } catch (error) {
    writeFileSync(resolve(root, `${mode}-launch-error.txt`), String(error.stdout ?? '') + '\n' + String(error.message));
    console.error('Ambiguous/failed launch. Preserve marker and reconcile EAS; never automatically retry.');
    process.exitCode = 1;
  }
} else throw new Error('Use prepare, verify, ios or android');
