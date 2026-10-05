// Owner-approved Android diagnostic build. Frozen build-24 source + exact overlays.
// No iOS, backend, Play submission, enforcement or credential mutation.
import assert from 'node:assert/strict';
import {evidenceRecord,evidenceArray,evidenceAt,evidenceStrings,evidenceNumber,evidenceText} from './release-evidence.mts';
import {createEasReadClient} from './eas-read-client.mts';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const require = createRequire(import.meta.url);
const cliRoot = 'C:/Users/gfahe/AppData/Roaming/npm/node_modules/eas-cli';
const cli = `${cliRoot}/bin/run`;
const root = resolve('test-results/android-diagnostics-25');
const candidate = resolve(root, 'upload');
const baseline = resolve('test-results/mobile-release-20261002');
const overlays = ['lib/memberReadDiagnostics.ts', 'lib/apiFailureTelemetry.ts',
  'plugins/withAndroidReadDiagnostics.cts', 'plugins/android-read-diagnostics/DojiReadResponseHints.java', '.easignore'];
const json = (path:string) => evidenceRecord(JSON.parse(readFileSync(path, 'utf8')));
const hash = (path:string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const save = (name:string, value:unknown) => writeFileSync(resolve(root, name), JSON.stringify(value, null, 2), { flag: 'wx' });
const walk = (path:string, prefix = ''):string[] => readdirSync(path, { withFileTypes: true }).flatMap(entry => {
  assert.ok(!entry.isSymbolicLink());
  if (!prefix && entry.name === '.expo') return [];
  return entry.isDirectory() ? walk(resolve(path, entry.name), prefix + entry.name + '/') : [prefix + entry.name];
});
function verify() {
  const manifest = json(resolve(root, 'manifest.json'));
  assert.deepEqual(walk(candidate).sort(), Object.keys(evidenceRecord(manifest.files)).sort());
  for (const [file, digest] of Object.entries(evidenceRecord(manifest.files))) assert.equal(hash(resolve(candidate, file)), digest, file);
  for (const file of overlays) assert.equal(hash(file), evidenceRecord(manifest.files)[file], `Overlay changed: ${file}`);
  const app = evidenceRecord(json(resolve(candidate, 'app.json')).expo);
  const old = evidenceRecord(json(resolve(baseline, 'upload/app.json')).expo);
  assert.deepEqual(app.ios, old.ios);
  assert.equal(app.version, '1.0.8'); assert.equal(evidenceAt(app, "android").versionCode, 25);
  assert.equal(evidenceAt(app, "android").package, 'com.doit.challengeapp');
  assert.equal(evidenceAt(app, "extra", "eas").projectId, '064b68b6-f138-4962-8aeb-f00970ba39c8');
  assert.equal(evidenceStrings(app.plugins).filter(x => x === './plugins/withAndroidReadDiagnostics').length, 1);
  const eas = json(resolve(candidate, 'eas.json'));
  assert.equal(evidenceAt(eas, "build", "production", "android").resourceClass, 'medium');
  assert.equal(evidenceAt(eas, "build", "production").autoIncrement, false);
  assert.equal(evidenceAt(eas, "submit", "production", "android").track, 'alpha');
  return manifest;
}
async function preflight() {
  const {metric,plan}=await createEasReadClient().buildCreditUsage('faheybaby');
  assert.ok(metric && Number.isFinite(metric.limit) && Number.isFinite(metric.value));
  const remaining = metric.limit - metric.value;
  assert.ok(remaining >= 700, 'Require $1 included Android credit plus $6 delayed-usage reserve; no overage');
  const history = evidenceArray(JSON.parse(execFileSync(process.execPath, [cli, 'build:list', '--platform', 'android', '--limit', '10', '--json', '--non-interactive'], { cwd: candidate, encoding: 'utf8', timeout: 60000 })));
  assert.ok(history.every(b => Number(b.appBuildVersion) < 25), 'Build number already used');
  assert.ok(history.every(b => ['FINISHED', 'ERRORED', 'CANCELED'].includes(evidenceText(b.status))), 'Active Android job exists');
  return { at: new Date().toISOString(), plan: plan, includedCents: metric.limit, usedCents: metric.value, remainingCents: remaining,
    buildCreditCents: 100, delayedUsageReserveCents: 600, newSpendAuthorized: false,
    history: history.map(b => ({ id: b.id, build: b.appBuildVersion, status: b.status })) };
}
mkdirSync(root, { recursive: true });
const mode = process.argv[2];
if (mode === 'prepare') {
  assert.ok(!existsSync(candidate), 'Preserve existing candidate');
  const old = json(resolve(baseline, 'manifest.json'));
  for (const [file, digest] of Object.entries(evidenceRecord(old.files))) {
    const source = resolve(baseline, 'upload', file);
    assert.equal(hash(source), digest, `Build-24 baseline changed: ${file}`);
    mkdirSync(dirname(resolve(candidate, file)), { recursive: true }); copyFileSync(source, resolve(candidate, file));
  }
  for (const file of overlays) { mkdirSync(dirname(resolve(candidate, file)), { recursive: true }); copyFileSync(file, resolve(candidate, file)); }
  const app = json(resolve(candidate, 'app.json'));
  evidenceAt(app, "expo", "android").versionCode = 25; evidenceStrings(evidenceAt(app,"expo").plugins).push('./plugins/withAndroidReadDiagnostics');
  writeFileSync(resolve(candidate, 'app.json'), JSON.stringify(app, null, 2) + '\n');
  const files = Object.fromEntries(walk(candidate).sort().map(file => [file, hash(resolve(candidate, file))]));
  const changed = Object.keys(files).filter(file => files[file] !== evidenceRecord(old.files)[file]);
  assert.deepEqual(changed.sort(), [...overlays, 'app.json'].sort());
  save('manifest.json', { at: new Date().toISOString(), baseline: 'Android 24 / CI-qualified 3160372', version: '1.0.8', android: 25, iosUnchanged: 102, files, changed });
  verify(); console.log(JSON.stringify({ prepared: true, files: Object.keys(files).length, changed }));
} else if (mode === 'prebuild') {
  verify(); const nativeRoot = resolve(root, 'prebuild-verified');
  assert.ok(!existsSync(nativeRoot), 'Preserve prior prebuild evidence');
  for (const file of walk(candidate)) { mkdirSync(dirname(resolve(nativeRoot, file)), { recursive: true }); copyFileSync(resolve(candidate, file), resolve(nativeRoot, file)); }
  const log = execFileSync(process.execPath, [resolve('node_modules/expo/bin/cli'), 'prebuild', '--platform', 'android', '--no-install'], {
    cwd: nativeRoot, env: { ...process.env, CI: '1', EXPO_NO_DOTENV: '1' }, encoding: 'utf8', timeout: 300000, maxBuffer: 6e6 });
  writeFileSync(resolve(root, 'prebuild.log'), log, { flag: 'wx' });
  const application = readFileSync(resolve(nativeRoot, 'android/app/src/main/java/com/doit/challengeapp/MainApplication.kt'), 'utf8');
  const statement = 'com.doji.network.DojiReadResponseHints.install("tvixsmqxotuvyjqzmjla.supabase.co")';
  assert.equal(application.split(statement).length, 2);
  assert.ok(application.indexOf(statement) < application.indexOf('loadReactNative(this)'));
  assert.equal(hash(resolve(nativeRoot, 'android/app/src/main/java/com/doji/network/DojiReadResponseHints.java')), hash(overlays[3]!));
  save('prebuild-proof.json', { at: new Date().toISOString(), androidOnly: true, nativeHelperSha256: hash(overlays[3]!), installerBeforeNativeStartup: true });
  verify(); console.log('Android Expo prebuild verified; candidate unchanged.');
} else if (mode === 'bundle') {
  verify(); require('@expo/env').load(resolve('.'), { silent: true });
  assert.equal(hash('package-lock.json'), hash(resolve(candidate, 'package-lock.json')));
  const log = execFileSync(process.execPath, [resolve('node_modules/expo/bin/cli'), 'export', '--platform', 'android', '--output-dir', resolve(root, 'bundle-android'), '--no-bytecode', '--source-maps', '--max-workers', '2'], {
    cwd: candidate, env: { ...process.env, ...evidenceRecord(evidenceAt(json(resolve(candidate, 'eas.json')), "build", "production").env), CI: '1', SENTRY_DISABLE_AUTO_UPLOAD: 'true' }, encoding: 'utf8', timeout: 600000, maxBuffer: 8e6 });
  writeFileSync(resolve(root, 'bundle-android.log'), log, { flag: 'wx' }); verify(); console.log('Exact Android production bundle passed.');
} else if (mode === 'launch') {
  verify(); assert.equal(process.argv[3], '--approved');
  assert.ok(!existsSync(resolve(root, 'attempt.json')), 'Never duplicate a launch');
  assert.ok(existsSync(resolve(root, 'bundle-android/metadata.json')));
  const native = json(resolve(root, 'prebuild-proof.json'));
  assert.equal(native.nativeHelperSha256, hash(overlays[3]!));
  const tests = json('test-results/android-25-local/regression.json');
  assert.equal(tests.success, true); assert.equal(tests.numFailedTests, 0); assert.ok(evidenceNumber(tests.numPassedTests) >= 183);
  assert.ok(Date.now() - evidenceNumber(tests.startTime) < 3600000, 'Refresh tests');
  save('cost-preflight.json', await preflight());
  save('attempt.json', { at: new Date().toISOString(), android: 25, diagnosticOnly: true, automaticSubmission: false });
  try {
    const raw = execFileSync(process.execPath, [cli, 'build', '--platform', 'android', '--profile', 'production', '--freeze-credentials', '--non-interactive', '--no-wait', '--json', '--message', 'Android 25 diagnostic: native 504 provenance and normalization-safe retry evidence. Production 504 origin NOT confirmed fixed. iOS unchanged.'], {
      cwd: candidate, env: { ...process.env, EAS_NO_VCS: '1', EAS_PROJECT_ROOT: candidate }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 600000, maxBuffer: 8e6 });
    const jobs = evidenceArray(JSON.parse(raw)).map(b => ({ id: b.id, status: b.status, platform: b.platform, version: b.appVersion, build: b.appBuildVersion, url: `https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/${b.id}` }));
    assert.equal(jobs.length, 1); assert.equal(jobs[0]!.platform, 'ANDROID');
    save('build.json', jobs); console.log(JSON.stringify(jobs));
  } catch { console.error('Launch failed or ambiguous. Attempt retained: inspect EAS history; never retry automatically.'); process.exitCode = 1; }
} else if (mode === 'verify') { verify(); console.log('Frozen candidate verified.'); }
else throw new Error('Use prepare, prebuild, bundle, verify, or launch --approved');
