/** Offline staging only. No network, cloud-build, upload, or scheduling capability. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { evidenceRecord as record } from './release-evidence.mts';

const source = resolve('.');
const root = resolve('test-results/push-recovery-next-build-20261008-v2');
const baselineRoot = resolve('test-results/mobile-logging-20261007-v109');
const runtime = [
  'app/_layout.tsx', 'app/(app)/notifications.tsx', 'app/(onboarding)/notifications.tsx',
  'hooks/useNativeNotifications.ts', 'lib/pushNotifications.ts', 'lib/retryPushRegistration.ts',
  'lib/commandGateway.ts', 'lib/memberReadDiagnostics.ts', 'lib/apiFailureTelemetry.ts',
  'lib/pushRegistrationCancellation.ts', 'lib/pushRegistrationScope.ts',
  'lib/pushRegistrationRecovery.ts', 'metro.config.cts',
  'lib/commandGatewayTransport.ts', 'lib/pushRegistrationStorage.ts',
  'app/(app)/(tabs)/suggest-challenge.tsx', 'app/(app)/profile/report-problem.tsx',
  'app/(app)/profile/settings.tsx', 'components/ui/Text.tsx', 'lib/supportDiagnostics.ts',
  'app/(app)/post/[id]/index.tsx',
];
const checks = [
  '__tests__/lib/pushRegistrationRecovery.test.ts', '__tests__/lib/pushRegistrationLifecycle.test.ts',
  '__tests__/lib/pushGatewayCancellation.test.ts', '__tests__/lib/pushNotifications.test.ts',
  '__tests__/lib/pushRegistrationBoundaries.test.ts', '__tests__/lib/retryPushRegistration.test.ts',
  '__tests__/lib/apiFailureTelemetry.test.ts', '__tests__/hooks/nativeNotificationsExecution.test.tsx',
  '__tests__/screens/accountControlsExecution.test.tsx', '__tests__/screens/onboardingPresentationExecution.test.tsx',
  'scripts/verify-push-recovery-bundle.mts', 'scripts/tsconfig.tooling.json',
  '__tests__/lib/supportDiagnostics.test.ts', '__tests__/screens/reportProblemExecution.test.tsx',
  '__tests__/screens/suggestionFormExecution.test.tsx', '__tests__/components/postCardExecution.test.tsx',
];
const digest = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
const read = (file: string) => record(JSON.parse(readFileSync(file, 'utf8')));
const walk = (dir: string, prefix = ''): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  assert.ok(!entry.isSymbolicLink(), 'Unexpected link in package');
  return entry.isDirectory() ? walk(resolve(dir, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`];
});
function baseline(platform: 'ios' | 'android') {
  const manifestPath = resolve(baselineRoot, platform, 'manifest.json');
  const manifest = read(manifestPath);
  const files = record(manifest.files);
  assert.equal(manifest.version, '1.0.9');
  assert.equal(manifest.build, platform === 'ios' ? 104 : 29);
  for (const [file, hash] of Object.entries(files)) {
    assert.equal(digest(resolve(baselineRoot, platform, 'upload', file)), hash, `Baseline drift: ${platform}/${file}`);
  }
  return { manifestSha256: digest(manifestPath), build: manifest.build };
}
function verify() {
  const manifest = read(resolve(root, 'manifest.json'));
  const files = record(manifest.files);
  assert.deepEqual(walk(root).filter(file => file !== 'manifest.json').sort(), Object.keys(files).sort());
  for (const [file, hash] of Object.entries(files)) assert.equal(digest(resolve(root, file)), hash, `Snapshot drift: ${file}`);
  for (const file of runtime) assert.equal(digest(resolve(source, file)), files[`overlay/${file}`], `Review newer source before building: ${file}`);
  for (const file of checks) assert.equal(digest(resolve(source, file)), files[`verification/${file}`], `Review newer verification source: ${file}`);
  assert.deepEqual(manifest.baselines, { ios: baseline('ios'), android: baseline('android') });
  console.log(JSON.stringify({ status: 'staged_for_next_owner_requested_build', runtimeFiles: runtime.length,
    verificationFiles: checks.length, automaticStart: false, buildsStarted: 0, package: root }));
}
const mode = process.argv[2];
assert.ok(mode === 'prepare' || mode === 'verify', 'Use prepare or verify; neither starts a build');
if (mode === 'prepare') {
  assert.ok(!existsSync(root), 'Never overwrite an existing next-build package');
  const baselines = { ios: baseline('ios'), android: baseline('android') };
  for (const [folder, paths] of [['overlay', runtime], ['verification', checks]] as const) {
    for (const file of paths) {
      const target = resolve(root, folder, file);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(resolve(source, file), target);
    }
  }
  for (const platform of ['ios', 'android'] as const) {
    const original = readFileSync(resolve(baselineRoot, platform, 'upload/.easignore'), 'utf8');
    assert.ok(!original.includes('!/metro.config.cts'), 'Reconcile baseline Metro config first');
    const patched = original.replace('!/eas.json', '!/metro.config.cts\n!/eas.json');
    assert.notEqual(patched, original);
    const target = resolve(root, 'platform-overlays', platform, '.easignore');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, patched, { flag: 'wx' });
  }
  const files = Object.fromEntries(walk(root).sort().map(file => [file, digest(resolve(root, file))]));
  writeFileSync(resolve(root, 'manifest.json'), JSON.stringify({
    preparedAt: new Date().toISOString(), source, baselineRoot, baselines, files,
    status: 'staged_for_next_owner_requested_build', automaticStart: false,
    nextVersion: null, nextIosBuild: null, nextAndroidVersionCode: null,
    includedCreditRemainingCentsAtLastCheck: 0, creditResetUtc: '2026-10-22T00:53:30.000Z',
    gates: ['Owner requests build', 'Fresh credit/cost and release-conflict checks',
      'Select new version/build numbers; never reuse 104/29', 'Compose frozen per-platform release candidates',
      'Rerun regression, exact-candidate source-map and native checks', 'Exact-build device acceptance and live symbolication'],
    excluded: ['portal', 'backend', 'database', 'release enforcement', 'automatic submission', 'billing changes'],
  }, null, 2) + '\n', { flag: 'wx' });
}
verify();
