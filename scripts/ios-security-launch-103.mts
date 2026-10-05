// One owner-approved replacement iOS build, included credit only; never retries.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {evidenceRecord,evidenceAt,evidenceArray,evidenceNumber,evidenceText} from './release-evidence.mts';
import {createEasReadClient} from './eas-read-client.mts';
const require = createRequire(import.meta.url);
const cliRoot = 'C:/Users/gfahe/AppData/Roaming/npm/node_modules/eas-cli';
const cli = `${cliRoot}/bin/run`;
const root = resolve('test-results/ios-security-103');
const candidate = resolve(root, 'upload');
const json = (p:string) => evidenceRecord(JSON.parse(readFileSync(p, 'utf8')));
const save = (name:string, value:unknown) => writeFileSync(resolve(root, name), JSON.stringify(value, null, 2), { flag: 'wx' });
assert.ok(process.argv[2] && ['--preflight', '--approved'].includes(process.argv[2]));
assert.ok(!existsSync(resolve(root, 'attempt.json')), 'Existing attempt: inspect, never retry');
execFileSync(process.execPath, ['scripts/ios-security-103.mts', 'verify'], { stdio: 'inherit' });
const focused = json(resolve(root, 'focused-regression.json'));
assert.equal(focused.success, true); assert.equal(focused.numFailedTests, 0); assert.ok(evidenceNumber(focused.numPassedTests) >= 131);
assert.equal(json(resolve(root, 'bundle-proof.json')).recursiveDecoderAbsent, true);
assert.equal(json(resolve(root, 'metro-security/result.json')).passed, true);
const audit = json(resolve(root, 'audit-patched.json'));
assert.equal(evidenceAt(audit,'metadata','vulnerabilities').critical, 0);
assert.ok(!evidenceAt(audit,'vulnerabilities')['decode-uri-component']);
// Fresh clean-candidate parser and router tests, no production requests.
const tests = execFileSync(process.execPath, ['--test', 'scripts/uri-decoder-security.test.mts'], {
  env: { ...process.env, URI_TEST_ROOT: candidate }, encoding: 'utf8', timeout: 30000 });
assert.match(tests, /pass 28/);
const {metric} = await createEasReadClient().buildCreditUsage('faheybaby');
assert.ok(metric && Number.isFinite(metric.limit) && Number.isFinite(metric.value));
const history = evidenceArray(JSON.parse(execFileSync(process.execPath, [cli, 'build:list', '--limit', '20', '--json', '--non-interactive'], { cwd: candidate, encoding: 'utf8', timeout: 60000 })));
assert.ok(history.some(b => Date.now() - Date.parse(evidenceText(b.createdAt)) > 86400000), 'History must cover full accounting-delay window');
assert.ok(history.every(b => ['FINISHED', 'ERRORED', 'CANCELED'].includes(evidenceText(b.status))), 'Unaccounted active job');
assert.ok(history.filter(b => b.platform === 'IOS').every(b => Number(b.appBuildVersion) < 103), 'Build number already used');
const knownRecent:Record<string,number> = {
  '8ea6d259-a652-4a20-9df0-6666a0921c5c': 200,
  '35c53463-dedf-4648-b153-c187084ecb39': 100,
  'b8dbbb2d-4590-4836-a5c1-998707da4515': 100,
  '3e226ceb-ebab-406f-832c-11468eea74a8': 100,
};
const recent = history.filter(b => Date.now() - Date.parse(evidenceText(b.createdAt)) <= 86400000);
assert.ok(recent.every(b => Object.hasOwn(knownRecent, evidenceText(b.id))), 'Unexpected recent job: reconcile cost before launch');
// Reserve AGAIN for every known job in the full 24-hour reporting-delay window,
// even though observed usage already advanced from $33 to $38 for these $5 jobs.
const delayedReserve = recent.reduce((sum, b) => sum + knownRecent[evidenceText(b.id)]!, 0);
const remaining = metric.limit - metric.value;
assert.ok(remaining >= 200 + delayedReserve, 'Insufficient included credit after delayed-usage reserve; no overage');
const evidence = { at: new Date().toISOString(), includedCents: metric.limit, usedCents: metric.value, remainingCents: remaining,
  buildCreditCents: 200, delayedUsageReserveCents: delayedReserve, newSpendAuthorized: false,
  history: history.map(b => ({ id: b.id, platform: b.platform, build: b.appBuildVersion, status: b.status, createdAt: b.createdAt })) };
if (process.argv[2] === '--preflight') { console.log(JSON.stringify(evidence)); process.exit(0); }
save('cost-preflight.json', evidence);
writeFileSync(resolve(root, 'decoder-regression.log'), tests, { flag: 'wx' });
save('attempt.json', { at: new Date().toISOString(), ios: 103, appleUpload: 'scheduled once with build', appStoreReview: 'gated separately' });
try {
  const raw = execFileSync(process.execPath, [cli, 'build', '--platform', 'ios', '--profile', 'production', '--freeze-credentials', '--non-interactive', '--no-wait', '--json', '--auto-submit-with-profile', 'production', '--message', 'iOS 103: replace vulnerable URI decoder with upstream 0.5.0; retain Router 57 query compatibility. Isolated build-102 source. Exact-device smoke and remaining build-tool advisory disposition gate public review.'], {
    cwd: candidate, env: { ...process.env, EAS_NO_VCS: '1', EAS_PROJECT_ROOT: candidate }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 600000, maxBuffer: 8e6 });
  const jobs = evidenceArray(JSON.parse(raw)).map(b => ({ id: b.id, status: b.status, platform: b.platform, version: b.appVersion, build: b.appBuildVersion, url: `https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/${b.id}` }));
  assert.equal(jobs.length, 1); assert.equal(jobs[0]!.platform, 'IOS'); assert.equal(jobs[0]!.build, '103');
  save('build.json', jobs); console.log(JSON.stringify(jobs));
} catch { console.error('Launch failed or ambiguous. Attempt preserved: inspect exact EAS jobs, never retry automatically.'); process.exitCode = 1; }
