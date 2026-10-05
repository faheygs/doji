// One Android-only candidate from frozen 26 + reviewed diagnostics/URI patch.
// No iOS job, automatic submission, credentials change or enforcement.
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
const root = resolve('test-results/android-diagnostics-27');
const candidate = resolve(root, 'upload');
const baseline = resolve('test-results/android-diagnostics-26');
const security = resolve('test-results/ios-security-103');
const overlays = ['lib/memberReadDiagnostics.ts', 'plugins/withAndroidReadDiagnostics.cts',
  'plugins/android-read-diagnostics/DojiReadResponseHints.java',
  'plugins/android-read-diagnostics/expoClientPatch.cts', '.easignore'];
const securityFiles = ['package.json', 'package-lock.json',
  'vendor/decode-uri-component-compat/package.json',
  'vendor/decode-uri-component-compat/index.cjs', 'vendor/decode-uri-component-compat/README.md'];
const json = (path:string) => evidenceRecord(JSON.parse(readFileSync(path, 'utf8')));
const hash = (p:string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const save = (name:string, value:unknown) => writeFileSync(resolve(root, name), JSON.stringify(value, null, 2), { flag: 'wx' });
const walk = (path:string, prefix = ''):string[] => readdirSync(path, { withFileTypes: true }).flatMap(e => {
  if (!prefix && ['.expo', 'node_modules'].includes(e.name)) return [];
  assert.ok(!e.isSymbolicLink());
  return e.isDirectory() ? walk(resolve(path, e.name), prefix + e.name + '/') : [prefix + e.name];
});
function copy(sourceRoot:string, file:string, targetRoot:string) {
  mkdirSync(dirname(resolve(targetRoot, file)), { recursive: true });
  copyFileSync(resolve(sourceRoot, file), resolve(targetRoot, file));
}
function verify() {
  const m = json(resolve(root, 'manifest.json'));
  assert.deepEqual(walk(candidate).sort(), Object.keys(evidenceRecord(m.files)).sort());
  for (const [f, digest] of Object.entries(evidenceRecord(m.files))) assert.equal(hash(resolve(candidate, f)), digest, f);
  for (const f of [...overlays, ...securityFiles]) assert.equal(hash(f), evidenceRecord(m.files)[f], `Tested source changed: ${f}`);
  const app = json(resolve(candidate, 'app.json'));
  const old = json(resolve(baseline, 'upload/app.json'));
  evidenceAt(old, "expo", "android").versionCode = 27;
  assert.deepEqual(app, old, 'Only Android version code changes in app config');
  assert.equal(evidenceAt(app, "expo").version, '1.0.8');
  assert.equal(evidenceAt(app, "expo", "android").package, 'com.doit.challengeapp');
  assert.equal(evidenceAt(app, "expo", "extra", "eas").projectId, '064b68b6-f138-4962-8aeb-f00970ba39c8');
  const eas = json(resolve(candidate, 'eas.json'));
  assert.equal(evidenceAt(eas, "build", "production", "android").resourceClass, 'medium');
  assert.equal(evidenceAt(eas, "build", "production").autoIncrement, false);
  const ignore = require('ignore')().add(readFileSync(resolve(candidate, '.easignore'), 'utf8'));
  for (const f of walk(candidate)) assert.ok(!ignore.ignores(f), `Candidate file excluded: ${f}`);
  assert.ok(ignore.ignores('scripts/android-expo-read-probe/entry.tsx'));
  assert.ok(ignore.ignores('android/app/build.gradle'));
  return m;
}
async function preflight() {
  const {metric,plan}=await createEasReadClient().buildCreditUsage('faheybaby');
  assert.ok(metric && Number.isFinite(metric.limit) && Number.isFinite(metric.value));
  const history = evidenceArray(JSON.parse(execFileSync(process.execPath, [cliRoot + '/bin/run', 'build:list', '--limit', '20', '--json', '--non-interactive'], { cwd: candidate, encoding: 'utf8', timeout: 60000 })));
  assert.ok(history.some(b => Date.now() - Date.parse(evidenceText(b.createdAt)) > 86400000), 'History must cover accounting delay');
  assert.ok(history.every(b => ['FINISHED', 'ERRORED', 'CANCELED'].includes(evidenceText(b.status))), 'An active job exists');
  assert.ok(history.filter(b => b.platform === 'ANDROID').every(b => Number(b.appBuildVersion) < 27), 'Build 27 or newer already exists');
  const known:Record<string,number> = { '3e226ceb-ebab-406f-832c-11468eea74a8': 100, '42873c98-ce5a-430e-b7f8-ea75033bb023': 200 };
  const recent = history.filter(b => Date.now() - Date.parse(evidenceText(b.createdAt)) <= 86400000);
  assert.ok(recent.every(b => Object.hasOwn(known, evidenceText(b.id))), 'Unknown recent usage: reconcile before launch');
  const reserve = recent.reduce((sum, b) => sum + evidenceNumber(known[evidenceText(b.id)]), 0);
  const remaining = metric.limit - metric.value;
  assert.ok(remaining >= 100 + reserve, 'Insufficient included credit after delayed-usage reserve');
  return { at: new Date().toISOString(), includedCents: metric.limit, usedCents: metric.value, remainingCents: remaining,
    buildCreditCents: 100, delayedUsageReserveCents: reserve, newSpendAuthorized: false,
    history: history.map(b => ({ id: b.id, platform: b.platform, build: b.appBuildVersion, status: b.status, createdAt: b.createdAt })) };
}
mkdirSync(root, { recursive: true });
const mode = process.argv[2];
if (mode === 'prepare') {
  assert.ok(!existsSync(candidate), 'Preserve existing candidate');
  const old = json(resolve(baseline, 'manifest.json'));
  for (const [f, digest] of Object.entries(evidenceRecord(old.files))) {
    assert.equal(hash(resolve(baseline, 'upload', f)), digest, `Baseline changed: ${f}`);
    copy(resolve(baseline, 'upload'), f, candidate);
  }
  const secured = json(resolve(security, 'manifest.json'));
  for (const f of securityFiles) {
    assert.equal(hash(resolve(security, 'upload', f)), evidenceRecord(secured.files)[f]);
    assert.equal(hash(f), evidenceRecord(secured.files)[f], `Reviewed URI patch changed: ${f}`);
    copy(resolve(security, 'upload'), f, candidate);
  }
  for (const f of overlays) copy(resolve('.'), f, candidate);
  const app = json(resolve(candidate, 'app.json')); evidenceAt(app, "expo", "android").versionCode = 27;
  writeFileSync(resolve(candidate, 'app.json'), JSON.stringify(app, null, 2) + '\n');
  const files = Object.fromEntries(walk(candidate).sort().map(f => [f, hash(resolve(candidate, f))]));
  const changed = Object.keys(files).filter(f => files[f] !== evidenceRecord(old.files)[f]);
  assert.deepEqual(changed.sort(), [...overlays, ...securityFiles, 'app.json'].sort());
  save('manifest.json', { at: new Date().toISOString(), baseline: 'Android 26 / 3e226ceb-ebab-406f-832c-11468eea74a8', version: '1.0.8', android: 27,
    deviceSmoke: 'Deferred to external Android testers per owner; not passed', files, changed });
  verify(); console.log(JSON.stringify({ prepared: true, count: Object.keys(files).length, changed }));
} else if (mode === 'prebuild') {
  verify(); const nativeRoot = resolve(root, 'prebuild-verified');
  assert.ok(!existsSync(nativeRoot), 'Preserve prebuild evidence');
  for (const f of walk(candidate)) copy(candidate, f, nativeRoot);
  const log = execFileSync(process.execPath, [resolve('node_modules/expo/bin/cli'), 'prebuild', '--platform', 'android', '--no-install'], {
    cwd: nativeRoot, env: { ...process.env, CI: '1', EXPO_NO_DOTENV: '1' }, encoding: 'utf8', timeout: 300000, maxBuffer: 6e6 });
  writeFileSync(resolve(root, 'prebuild.log'), log, { flag: 'wx' });
  const application = readFileSync(resolve(nativeRoot, 'android/app/src/main/java/com/doit/challengeapp/MainApplication.kt'), 'utf8');
  const install = 'com.doji.network.DojiReadResponseHints.install("tvixsmqxotuvyjqzmjla.supabase.co", "doji-orchestrator.faheygs.workers.dev")';
  assert.equal(application.split(install).length, 2);
  assert.ok(application.indexOf(install) < application.indexOf('loadReactNative(this)'));
  assert.equal(hash(resolve(nativeRoot, 'android/app/src/main/java/com/doji/network/DojiReadResponseHints.java')), hash(overlays[2]!));
  const expoDir = resolve(dirname(require.resolve('expo/package.json')), 'android/src/main/java/expo/modules/fetch');
  const kotlin = readFileSync(resolve(expoDir, 'ExpoFetchModule.kt'), 'utf8');
  assert.equal((kotlin.match(/Doji passive read observer/g) || []).length, 1);
  assert.equal(readFileSync(resolve(expoDir, 'DojiReadResponseHints.java'), 'utf8'), readFileSync(overlays[2]!, 'utf8').replace('package com.doji.network;', 'package expo.modules.fetch;'));
  save('prebuild-proof.json', { at: new Date().toISOString(), androidOnly: true, nativeHelperSha256: hash(overlays[2]!), expoAttachmentSha256: hash(overlays[3]!), installerBeforeStartup: true, expoObserverPresent: true });
  verify(); console.log('Exact Android prebuild and both observer attachments verified.');
} else if (mode === 'bundle') {
  verify(); require('@expo/env').load(resolve('.'), { silent: true });
  assert.equal(hash('package-lock.json'), hash(resolve(candidate, 'package-lock.json')));
  const log = execFileSync(process.execPath, [resolve('node_modules/expo/bin/cli'), 'export', '--platform', 'android', '--output-dir', resolve(root, 'bundle-android'), '--no-bytecode', '--source-maps', '--max-workers', '2'], {
    cwd: candidate, env: { ...process.env, ...evidenceRecord(evidenceAt(json(resolve(candidate, 'eas.json')), "build", "production").env), CI: '1', SENTRY_DISABLE_AUTO_UPLOAD: 'true' }, encoding: 'utf8', timeout: 600000, maxBuffer: 8e6 });
  writeFileSync(resolve(root, 'bundle-android.log'), log, { flag: 'wx' });
  const sources = walk(resolve(root, 'bundle-android')).filter(f => f.endsWith('.map')).flatMap(f => {
    const m = json(resolve(root, 'bundle-android', f));
    const names=evidenceStrings(m.sources),contents=evidenceStrings(m.sourcesContent);
    assert.equal(names.length,contents.length,'Incomplete source map');
    return names.map((name,i)=>({name,content:contents[i]!}));
  });
  assert.ok(sources.some(s => /decode-uri-component-upstream\/index.js$/.test(s.name) && s.content.includes('function utf8SequenceLength')));
  assert.ok(sources.some(s => /decode-uri-component-compat\/index.cjs$/.test(s.name)));
  assert.ok(!sources.some(s => s.content?.includes('function decodeComponents(components, split)')));
  for (const name of ['brace-expansion', 'braces', 'http-cache-semantics', 'js-yaml', 'node-forge']) {
    assert.ok(!sources.some(s => s.name.includes('/' + name + '/')), `Advisory package bundled: ${name}`);
  }
  save('bundle-proof.json', { at: new Date().toISOString(), platform: 'android', sources: sources.length, patchedDecoderBundled: true, recursiveDecoderAbsent: true, fiveKnownToolAdvisoryRootsAbsent: true });
  verify(); console.log('Exact Android export passed, URI patch verified, known tooling advisory roots absent from runtime map.');
} else if (mode === 'preflight') { verify(); console.log(JSON.stringify(await preflight())); }
else if (mode === 'verify') { verify(); console.log('Frozen Android 27 candidate verified.'); }
else if (mode === 'launch') {
  verify(); assert.equal(process.argv[3], '--approved');
  assert.ok(!existsSync(resolve(root, 'attempt.json')), 'Never duplicate a launch');
  assert.equal(json(resolve(root, 'bundle-proof.json')).recursiveDecoderAbsent, true);
  assert.equal(json(resolve(root, 'prebuild-proof.json')).nativeHelperSha256, hash(overlays[2]!));
  const tests = json(resolve(root, 'regression.json'));
  assert.equal(tests.success, true); assert.equal(tests.numFailedTests, 0); assert.ok(evidenceNumber(tests.numPassedTests) >= 108);
  assert.ok(Date.now() - evidenceNumber(tests.startTime) < 3600000, 'Refresh tests');
  const probe = json('test-results/android-expo-read-probe/2026-10-04T01-37-21-715Z.json');
  assert.equal(probe.passed, true); assert.equal(probe.count, 28); assert.equal(probe.nativeBridgeMocked, false);
  const decoderTests = execFileSync(process.execPath, ['--test', 'scripts/uri-decoder-security.test.mts'], {
    env: { ...process.env, URI_TEST_ROOT: candidate }, encoding: 'utf8', timeout: 30000 });
  assert.match(decoderTests, /pass 28/);
  writeFileSync(resolve(root, 'decoder-regression.log'), decoderTests, { flag: 'wx' });
  save('cost-preflight.json', await preflight());
  save('attempt.json', { at: new Date().toISOString(), android: 27, diagnosticOnly: true, automaticSubmission: false, deviceAcceptanceDeferredToTesters: true });
  try {
    const raw = execFileSync(process.execPath, [cliRoot + '/bin/run', 'build', '--platform', 'android', '--profile', 'production', '--freeze-credentials', '--non-interactive', '--no-wait', '--json', '--message', 'Android 27: attach passive diagnostics to actual Expo fetch and gateway reads; retain reviewed URI-decoder security repair. Production 504 origin NOT confirmed fixed. Device acceptance deferred to Android testers. No iOS job.'], {
      cwd: candidate, env: { ...process.env, EAS_NO_VCS: '1', EAS_PROJECT_ROOT: candidate }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 600000, maxBuffer: 8e6 });
    const jobs = evidenceArray(JSON.parse(raw)).map(b => ({ id: b.id, status: b.status, platform: b.platform, version: b.appVersion, build: b.appBuildVersion, url: `https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/${b.id}` }));
    assert.equal(jobs.length, 1); assert.equal(jobs[0]!.platform, 'ANDROID'); assert.equal(jobs[0]!.build, '27');
    save('build.json', jobs); console.log(JSON.stringify(jobs));
  } catch { console.error('Launch failed or ambiguous; inspect history, never retry automatically.'); process.exitCode = 1; }
} else throw new Error('Use prepare, verify, prebuild, bundle, preflight, or launch --approved');
