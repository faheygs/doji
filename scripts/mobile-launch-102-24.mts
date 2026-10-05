// Approved October 2 mobile candidates. One launch attempt per platform; no retries.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {evidenceRecord,evidenceArray,evidenceNumber,evidenceText} from './release-evidence.mts';
import {createEasReadClient} from './eas-read-client.mts';
const require = createRequire(import.meta.url);
const cliRoot = 'C:/Users/gfahe/AppData/Roaming/npm/node_modules/eas-cli';
const cli = `${cliRoot}/bin/run`;
const root = resolve('test-results/mobile-release-20261002');
const candidate = resolve(root, 'upload');
const json = (p:string) => evidenceRecord(JSON.parse(readFileSync(p, 'utf8')));
const save = (name:string, value:unknown) => writeFileSync(resolve(root, name), JSON.stringify(value, null, 2), { flag: 'wx' });
const platform = process.argv[2];
assert.ok(platform && ['ios', 'android'].includes(platform));
assert.equal(process.argv[3], '--approved');
assert.ok(!existsSync(resolve(root, `${platform}-attempt.json`)), 'Existing attempt: inspect jobs; never retry automatically');
execFileSync(process.execPath, ['scripts/mobile-release-20261002.mts', 'verify'], { stdio: 'inherit' });
for (const p of ['ios', 'android']) assert.ok(existsSync(resolve(root, `final-bundle-${p}/metadata.json`)));
const tests = json(resolve(root, 'focused-regression.json'));
assert.equal(tests.success, true); assert.equal(tests.numFailedTests, 0); assert.ok(evidenceNumber(tests.numPassedTests) >= 214);
const {metric,plan} = await createEasReadClient().buildCreditUsage('faheybaby');
assert.ok(metric && Number.isFinite(metric.limit) && Number.isFinite(metric.value));
const remaining = metric.limit - metric.value;
// Require the whole pair plus a conservative $6 allowance for delayed accounting.
assert.ok(remaining >= 900, `Insufficient included credit; no paid overage authorized (${remaining} cents remaining)`);
save(`${platform}-cost-preflight.json`, { at: new Date().toISOString(), plan, usedCents: metric.value, includedCents: metric.limit, remainingCents: remaining, pairCents: 300, delayedUsageReserveCents: 600, newSpendAuthorized: false });
const history = evidenceArray(JSON.parse(execFileSync(process.execPath, [cli, 'build:list', '--platform', platform, '--limit', '10', '--json', '--non-interactive'], { cwd: candidate, encoding: 'utf8', timeout: 60000 })));
const next = platform === 'ios' ? 102 : 24;
assert.ok(history.every(b => Number(b.appBuildVersion) < next), 'Build number already used');
assert.ok(history.every(b => ['FINISHED', 'ERRORED', 'CANCELED'].includes(evidenceText(b.status))), 'Active same-platform build exists');
save(`${platform}-history.json`, history.map(b => ({ id: b.id, status: b.status, build: b.appBuildVersion, createdAt: b.createdAt })));
save(`${platform}-attempt.json`, { at: new Date().toISOString(), platform, build: next, destination: platform === 'ios' ? 'Apple upload; App Store Review is separate' : 'Existing Closed testing Alpha; upload separately' });
const args = [cli, 'build', '--platform', platform, '--profile', 'production', '--freeze-credentials', '--non-interactive', '--no-wait', '--json', '--message', 'CI-qualified 3160372: account-scoped shop/social recovery, validation and Expo patches. Exact-device acceptance and dependency advisory review remain release gates.'];
if (platform === 'ios') args.push('--auto-submit-with-profile', 'production');
try {
  const raw = execFileSync(process.execPath, args, { cwd: candidate, env: { ...process.env, EAS_NO_VCS: '1', EAS_PROJECT_ROOT: candidate }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 600000, maxBuffer: 8e6 });
  const builds = evidenceArray(JSON.parse(raw)).map(b => ({ id: b.id, status: b.status, platform: b.platform, appVersion: b.appVersion, appBuildVersion: b.appBuildVersion, url: `https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/${b.id}` }));
  assert.equal(builds.length, 1); assert.equal(builds[0]!.platform, platform.toUpperCase());
  save(`${platform}-build.json`, builds); console.log(JSON.stringify(builds));
} catch {
  console.error('Launch result ambiguous or failed. Preserve attempt marker and inspect EAS history before any further action.');
  process.exitCode = 1;
}
