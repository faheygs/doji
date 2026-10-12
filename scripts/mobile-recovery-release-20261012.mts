// Owner approved one iOS + Android build, $3 total overage; no submission/retry.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import { evidenceRecord as record, evidenceAt as at, evidenceArray as rows, evidenceText as text } from './release-evidence.mts';
import { createEasReadClient } from './eas-read-client.mts';
const require = createRequire(import.meta.url);
const source = resolve(import.meta.dirname, '..');
const root = resolve(source, 'test-results/mobile-recovery-20261012');
const baselineRoot = resolve(source, 'test-results/mobile-logging-20261007-v109');
const cli = 'C:/Users/gfahe/AppData/Roaming/npm/node_modules/eas-cli/bin/run';
const platforms = ['ios', 'android'] as const;
type Platform = typeof platforms[number];
const versions = { ios: 105, android: 30 };
const costs = { ios: 200, android: 100 };
const json = (p: string) => record(JSON.parse(readFileSync(p, 'utf8')));
const hash = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const candidate = (p: Platform) => resolve(root, p, 'upload');
const save = (p: string, v: unknown) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(v, null, 2) + '\n', { flag: 'wx' }); };
const walk = (p: string, prefix = ''): string[] => readdirSync(p, { withFileTypes: true }).flatMap(e => {
  if (!prefix && ['node_modules', '.expo'].includes(e.name)) return [];
  assert.ok(!e.isSymbolicLink(), 'Unexpected symbolic link');
  return e.isDirectory() ? walk(resolve(p, e.name), prefix + e.name + '/') : [prefix + e.name];
});
const copy = (from: string, file: string, to: string) => { mkdirSync(dirname(resolve(to, file)), { recursive: true }); copyFileSync(resolve(from, file), resolve(to, file)); };
const snapshot = json(resolve(source, 'test-results/push-recovery-next-build-20261008-v4/manifest.json'));
const runtime = Object.keys(record(snapshot.files)).filter(f => f.startsWith('overlay/') && !f.startsWith('overlay/plugins/')).map(f => f.slice(8));
assert.equal(runtime.length, 21);
function verify(p: Platform) {
  const m = json(resolve(root, p, 'manifest.json')), files = record(m.files);
  assert.deepEqual(walk(candidate(p)).sort(), Object.keys(files).sort());
  for (const [f, digest] of Object.entries(files)) assert.equal(hash(resolve(candidate(p), f)), digest, f);
  for (const f of runtime) assert.equal(hash(resolve(source, f)), files[f], `Reviewed source drift: ${f}`);
  const base = resolve(baselineRoot, p, 'upload');
  const app = json(resolve(base, 'app.json'));
  at(app, 'expo').version = '1.0.10';
  at(app, 'expo', p)[p === 'ios' ? 'buildNumber' : 'versionCode'] = p === 'ios' ? String(versions[p]) : versions[p];
  assert.deepEqual(json(resolve(candidate(p), 'app.json')), app);
  assert.equal(hash(resolve(candidate(p), 'eas.json')), hash(resolve(base, 'eas.json')));
  const ignore = require('ignore')().add(readFileSync(resolve(candidate(p), '.easignore'), 'utf8'));
  for (const f of Object.keys(files)) assert.ok(!ignore.ignores(f), `Excluded from upload: ${f}`);
  for (const f of ['.env.local', 'web/index.html', 'infra/worker.ts', 'supabase/migrations/x.sql', '__tests__/x.ts', 'test-results/private.json']) assert.ok(ignore.ignores(f));
  const lock = at(json(resolve(source, 'package-lock.json')), 'packages');
  assert.deepEqual(at(json(resolve(candidate(p), 'package-lock.json')), 'packages'), lock);
  return m;
}
function prepare(p: Platform) {
  const dest = candidate(p), base = resolve(baselineRoot, p, 'upload');
  assert.ok(!existsSync(dest), 'Preserve existing candidate');
  const old = record(json(resolve(baselineRoot, p, 'manifest.json')).files);
  for (const [f, digest] of Object.entries(old)) { assert.equal(hash(resolve(base, f)), digest, `Baseline drift: ${f}`); copy(base, f, dest); }
  for (const f of runtime) copy(source, f, dest);
  const pkg = json(resolve(dest, 'package.json')), current = json(resolve(source, 'package.json'));
  const allowed = new Set(['expo', 'expo-constants', 'expo-dev-client', 'expo-image-manipulator', 'expo-linking', 'expo-notifications', 'expo-router', 'expo-splash-screen', 'jest-expo']);
  for (const group of ['dependencies', 'devDependencies', 'overrides']) {
    const original = record(pkg[group]), next = record(current[group]);
    for (const name of new Set([...Object.keys(original), ...Object.keys(next)])) {
      if (original[name] !== next[name]) { assert.ok(allowed.has(name), `Unreviewed dependency: ${name}`); original[name] = next[name]; }
    }
    assert.deepEqual(original, next);
  }
  writeFileSync(resolve(dest, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  copy(source, 'package-lock.json', dest);
  const app = json(resolve(dest, 'app.json'));
  at(app, 'expo').version = '1.0.10';
  at(app, 'expo', p)[p === 'ios' ? 'buildNumber' : 'versionCode'] = p === 'ios' ? String(versions[p]) : versions[p];
  writeFileSync(resolve(dest, 'app.json'), JSON.stringify(app, null, 2) + '\n');
  const ignore = readFileSync(resolve(base, '.easignore'), 'utf8');
  assert.ok(!ignore.includes('!/metro.config.cts'));
  writeFileSync(resolve(dest, '.easignore'), ignore.replace('!/eas.json', '!/metro.config.cts\n!/eas.json'));
  if (p === 'android') {
    // Preserve the released JS plugin filenames; generate from reviewed TS, not
    // a hand-maintained second implementation or an unreferenced CTS overlay.
    const f = 'plugins/android-read-diagnostics/expoClientPatch';
    const emitted = ts.transpileModule(readFileSync(resolve(source, f + '.cts'), 'utf8'), {
      fileName: f + '.cts', reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    });
    assert.ok(!emitted.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error));
    writeFileSync(resolve(dest, f + '.js'), emitted.outputText);
    assert.equal(require(resolve(dest, f + '.js')).instrumentExpoClient(
      readFileSync(resolve(source, 'node_modules/expo/android/src/main/java/expo/modules/fetch/ExpoFetchModule.kt'), 'utf8'),
      '57.0.28', 'tvixsmqxotuvyjqzmjla.supabase.co', 'doji-orchestrator.faheygs.workers.dev').split('Doji passive read observer').length, 2);
  }
  const files = Object.fromEntries(walk(dest).sort().map(f => [f, hash(resolve(dest, f))]));
  const changed = Object.keys(files).filter(f => files[f] !== old[f]);
  const accepted = new Set([...runtime, 'app.json', '.easignore', 'package.json', 'package-lock.json', 'plugins/android-read-diagnostics/expoClientPatch.js']);
  assert.ok(changed.every(f => accepted.has(f)), 'Unexpected release input');
  save(resolve(root, p, 'manifest.json'), { at: new Date().toISOString(), platform: p, version: '1.0.10', build: versions[p], files, changed,
    baselineManifestSha256: hash(resolve(baselineRoot, p, 'manifest.json')), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim(),
    nativeConfigurationPreserved: true, automaticSubmission: false, ownerApprovedOverageCents: 300 });
  verify(p); console.log(JSON.stringify({ prepared: p, version: '1.0.10', build: versions[p], changed }));
}
function bundle(p: Platform) {
  verify(p);
  const output = resolve(root, p, 'bundle-installed'); assert.ok(!existsSync(output), 'Preserve export evidence');
  assert.ok(existsSync(resolve(candidate(p), 'node_modules/expo/package.json')), 'Install exact candidate first');
  require('@expo/env').load('D:/ChallengeApp/DoIt', { silent: true });
  const log = execFileSync(process.execPath, [resolve(candidate(p), 'node_modules/expo/bin/cli'), 'export', '--platform', p, '--output-dir', output, '--no-bytecode', '--source-maps', '--max-workers', '2'], {
    cwd: candidate(p), timeout: 600000, maxBuffer: 12e6, encoding: 'utf8',
    env: { ...process.env, ...at(json(resolve(candidate(p), 'eas.json')), 'build', 'production', 'env'), NODE_ENV: 'production', CI: '1', EXPO_NO_DOTENV: '1', EXPO_NO_TELEMETRY: '1', SENTRY_DISABLE_AUTO_UPLOAD: 'true', SENTRY_AUTH_TOKEN: '' },
  });
  writeFileSync(resolve(root, p, 'bundle-installed.log'), log, { flag: 'wx' });
  const { SourceMapConsumer } = require('source-map');
  const maps = walk(output).filter(f => f.endsWith('.map'));
  const proofs: unknown[] = [];
  for (const file of maps) {
    const map = JSON.parse(readFileSync(resolve(output, file), 'utf8')) as { debug_id?: string; debugId?: string; sources: string[]; sourcesContent: string[] };
    const index = map.sources.findIndex(f => f.endsWith('/lib/apiFailureTelemetry.ts')); if (index < 0) continue;
    const id = map.debug_id ?? map.debugId; assert.match(id ?? '', /^[a-f0-9-]{36}$/);
    const code = readFileSync(resolve(output, file.slice(0, -4)), 'utf8'); assert.ok(code.includes('_sentryDebugIds') && code.includes(id!));
    for (const f of runtime.filter(f => !f.endsWith('.cts'))) assert.ok(map.sources.some(s => s.endsWith('/' + f)), `Missing bundle module: ${f}`);
    const lines = map.sourcesContent[index]!.split('\n'), line = lines.findIndex(s => s.includes('Sentry.captureException')) + 1;
    assert.ok(line > 0); const consumer = new SourceMapConsumer(map);
    const generated = consumer.generatedPositionFor({ source: map.sources[index], line, column: lines[line - 1]!.indexOf('Sentry.captureException') });
    assert.ok(generated.line != null); const original = consumer.originalPositionFor(generated);
    assert.equal(original.source, map.sources[index]); assert.equal(original.line, line);
    proofs.push({ debugId: id, mappedSource: 'lib/apiFailureTelemetry.ts', line });
  }
  assert.ok(proofs.length); save(resolve(root, p, 'bundle-installed-proof.json'), { at: new Date().toISOString(), passed: true, exactCandidate: true, proofs });
  verify(p); console.log(`${p} frozen release bundle and source map verified`);
}
function regression(p: Platform) {
  verify(p);
  const qa = resolve(root, p, 'qa-complete'); assert.ok(!existsSync(qa), 'Preserve regression evidence');
  for (const f of walk(candidate(p))) copy(candidate(p), f, qa);
  symlinkSync(resolve(candidate(p), 'node_modules'), resolve(qa, 'node_modules'), 'junction');
  for (const dir of ['__tests__', '__mocks__']) for (const f of walk(resolve(source, dir))) copy(source, dir + '/' + f, qa);
  for (const f of ['jest.setup.ts', 'jest.transform.cts', 'jest.tooling-transform.cts', 'plugins/withAndroidReadDiagnostics.cts', 'plugins/android-read-diagnostics/expoClientPatch.cts', 'plugins/android-read-diagnostics/DojiReadResponseHints.java', 'infra/doji-orchestrator/src/operational-health.ts']) copy(source, f, qa);
  for (const f of walk(resolve(source, 'supabase/migrations'))) copy(source, 'supabase/migrations/' + f, qa);
  // Test-only scaffolding; no fixture or test is inside the upload manifest.
  const config: Record<string, unknown> = { ...record(json(resolve(source, 'package.json')).jest), rootDir: qa };
  config.testPathIgnorePatterns = ['/node_modules/']; config.modulePathIgnorePatterns = [];
  const configPath = resolve(root, p, 'jest-config-complete.json'); save(configPath, config);
  const wanted = /(?:push|notification|diagnostic|support|commandGateway|query|realtime|media|upload|auth|participation|native|expoClient|postCard|accountControls|onboardingPresentation|reportProblem|suggestionForm)/i;
  const tests = walk(resolve(qa, '__tests__')).filter(f => /^(lib|hooks|screens|components|utils|stores|contexts)\//.test(f) && /\.test\.tsx?$/.test(f) && wanted.test(f));
  assert.ok(tests.length >= 50);
  save(resolve(root, p, 'regression-selection-complete.json'), tests);
  execFileSync(process.execPath, [resolve(candidate(p), 'node_modules/jest/bin/jest.js'), '--config', configPath, '--runInBand', '--json', '--outputFile', resolve(root, p, 'regression-complete.json'), '--runTestsByPath', ...tests.map(f => resolve(qa, '__tests__', f))], {
    cwd: qa, timeout: 600000, maxBuffer: 12e6, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CI: '1', SENTRY_DISABLE_AUTO_UPLOAD: 'true', SENTRY_AUTH_TOKEN: '' },
  });
  const result = json(resolve(root, p, 'regression-complete.json'));
  assert.equal(result.success, true); verify(p);
  console.log(JSON.stringify({ platform: p, suites: result.numPassedTestSuites, tests: result.numPassedTests, failed: result.numFailedTests }));
}
function native() {
  for (const p of platforms) {
    verify(p);
    const raw = execFileSync(process.execPath, [resolve(candidate(p), 'node_modules/expo-modules-autolinking/bin/expo-modules-autolinking'), 'resolve', '--platform', p === 'ios' ? 'apple' : 'android', '--json'], { cwd: candidate(p), encoding: 'utf8', timeout: 60000, maxBuffer: 5e6 });
    const linked = JSON.parse(raw) as { modules: { packageName: string; packageVersion: string }[] };
    assert.ok(linked.modules.some(m => m.packageName === 'expo-network' && m.packageVersion === '57.0.2'));
    save(resolve(root, p, 'autolink-proof.json'), { at: new Date().toISOString(), modules: linked.modules.map(m => ({ name: m.packageName, version: m.packageVersion })) });
  }
  const p = 'android', dest = resolve(root, p, 'prebuild'); assert.ok(!existsSync(dest), 'Preserve native evidence');
  for (const f of walk(candidate(p))) copy(candidate(p), f, dest);
  symlinkSync(resolve(candidate(p), 'node_modules'), resolve(dest, 'node_modules'), 'junction');
  const log = execFileSync(process.execPath, [resolve(candidate(p), 'node_modules/expo/bin/cli'), 'prebuild', '--platform', 'android', '--no-install'], { cwd: dest, encoding: 'utf8', timeout: 300000, maxBuffer: 8e6, env: { ...process.env, CI: '1', EXPO_NO_DOTENV: '1', EXPO_NO_TELEMETRY: '1' } });
  writeFileSync(resolve(root, p, 'prebuild.log'), log, { flag: 'wx' });
  const app = readFileSync(resolve(dest, 'android/app/src/main/java/com/doit/challengeapp/MainApplication.kt'), 'utf8');
  const installer = 'com.doji.network.DojiReadResponseHints.install("tvixsmqxotuvyjqzmjla.supabase.co", "doji-orchestrator.faheygs.workers.dev")';
  assert.equal(app.split(installer).length, 2); assert.ok(app.indexOf(installer) < app.indexOf('loadReactNative(this)'));
  const helper = 'plugins/android-read-diagnostics/DojiReadResponseHints.java';
  assert.equal(hash(resolve(dest, 'android/app/src/main/java/com/doji/network/DojiReadResponseHints.java')), hash(resolve(candidate(p), helper)));
  const expoDir = resolve(candidate(p), 'node_modules/expo/android/src/main/java/expo/modules/fetch');
  assert.equal(readFileSync(resolve(expoDir, 'ExpoFetchModule.kt'), 'utf8').split('Doji passive read observer').length, 2);
  assert.equal(readFileSync(resolve(expoDir, 'DojiReadResponseHints.java'), 'utf8'), readFileSync(resolve(candidate(p), helper), 'utf8').replace('package com.doji.network;', 'package expo.modules.fetch;'));
  save(resolve(root, 'native-proof.json'), { at: new Date().toISOString(), passed: true, autolinkBoth: true, androidPrebuild: true, physicalDeviceAcceptance: false, iosNativeCompilation: 'EAS required' });
  for (const platform of platforms) verify(platform);
  console.log('Native module resolution and Android observer/prebuild verified');
}
async function preflight() {
  const usage = await createEasReadClient().buildCreditUsage('faheybaby');
  const history = rows(JSON.parse(execFileSync(process.execPath, [cli, 'build:list', '--limit', '20', '--json', '--non-interactive'], { cwd: source, encoding: 'utf8', timeout: 60000 })));
  const ours = platforms.flatMap(p => existsSync(resolve(root, p, 'build.json')) ? rows(JSON.parse(readFileSync(resolve(root, p, 'build.json'), 'utf8'))) : []);
  const ids = new Set(ours.map(b => b.id));
  assert.ok(history.some(b => Date.now() - Date.parse(text(b.createdAt)) > 86400000));
  assert.ok(history.every(b => ids.has(b.id) || ['FINISHED', 'ERRORED', 'CANCELED'].includes(text(b.status))), 'Unknown active build');
  for (const p of platforms) assert.ok(history.filter(b => b.platform === p.toUpperCase() && !ids.has(b.id)).every(b => Number(b.appBuildVersion) < versions[p]), 'Version conflict');
  assert.ok(history.filter(b => Date.now() - Date.parse(text(b.createdAt)) <= 86400000).every(b => ids.has(b.id)), 'Unreconciled recent usage');
  return { at: new Date().toISOString(), ...usage, ownerApprovedOverageCents: 300, pendingCents: platforms.filter(p => !existsSync(resolve(root, p, 'attempt.json'))).reduce((n, p) => n + costs[p], 0),
    history: history.map(b => ({ id: b.id, platform: b.platform, status: b.status, build: b.appBuildVersion })) };
}
async function launch(p: Platform) {
  verify(p); assert.equal(process.argv[4], '--approved');
  assert.ok(!existsSync(resolve(root, p, 'attempt.json')), 'Never repeat an uncertain launch');
  for (const platform of platforms) assert.equal(json(resolve(root, platform, 'bundle-installed-proof.json')).passed, true);
  assert.equal(json(resolve(root, 'native-proof.json')).passed, true);
  for (const platform of platforms) {
    const tests = json(resolve(root, platform, 'regression-complete.json'));
    assert.equal(tests.success, true); assert.equal(tests.numFailedTests, 0); assert.ok(Number(tests.numPassedTests) >= 500);
    assert.ok(Date.now() - Number(tests.startTime) < 7200000, 'Refresh regression');
  }
  save(resolve(root, p, 'cost-preflight.json'), await preflight());
  save(resolve(root, p, 'attempt.json'), { at: new Date().toISOString(), build: versions[p], ownerApproved: true, maximumCostCents: costs[p], automaticSubmission: false });
  try {
    const raw = execFileSync(process.execPath, [cli, 'build', '--platform', p, '--profile', 'production', '--freeze-credentials', '--non-interactive', '--no-wait', '--json', '--message', `Doji 1.0.10 (${versions[p]}): push recovery, diagnostics, support and approved Expo patches. No auto submission.`], {
      cwd: candidate(p), env: { ...process.env, EAS_NO_VCS: '1', EAS_PROJECT_ROOT: candidate(p) }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 600000, maxBuffer: 8e6,
    });
    const jobs = rows(JSON.parse(raw)).map(b => ({ id: b.id, platform: b.platform, status: b.status, version: b.appVersion, build: b.appBuildVersion, url: `https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/${b.id}` }));
    assert.equal(jobs.length, 1); assert.equal(jobs[0]?.build, String(versions[p])); assert.equal(jobs[0]?.version, '1.0.10');
    save(resolve(root, p, 'build.json'), jobs); console.log(JSON.stringify(jobs));
  } catch { console.error('Build launch failed or ambiguous. Preserve attempt marker; reconcile history, never automatically retry.'); process.exitCode = 1; }
}
const mode = process.argv[2], platform = process.argv[3];
if (mode === 'preflight') console.log(JSON.stringify(await preflight()));
else if (mode === 'native') native();
else {
  assert.ok(platform === 'ios' || platform === 'android');
  if (mode === 'prepare') prepare(platform);
  else if (mode === 'verify') { verify(platform); console.log(`${platform} verified`); }
  else if (mode === 'bundle') bundle(platform);
  else if (mode === 'regression') regression(platform);
  else if (mode === 'launch') await launch(platform);
  else throw Error('Use prepare|verify|bundle|launch <platform> or preflight');
}
