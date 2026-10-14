// Historical, explicitly approved EMPLOYEE-ONLY release. No DB/Pages/secret writes.
// Never use as a general deploy script. Exact prepared manifests prevent drift.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { cli, ref, hash, inventory } from './prepare-safety-launch.mts';
import { functions, secrets, health } from './business-disabled-release-reads.mts';
import { evidenceArray, evidenceAssets, evidenceRecord, evidenceText } from './release-evidence.mts';
import { assertSecretDigestsUnchanged } from './staff-workflow-release-guards.mts';
const root = 'test-results/employee-logout-release-20261013';
const slug = 'employee-portal-v2';
const mode = process.argv[2];
assert.ok(['deploy', 'verify', 'rollback'].includes(mode || ''));
const read = async (name: string) => evidenceRecord(JSON.parse(await readFile(root + '/' + name, 'utf8')));
const save = (name: string, value: unknown) => writeFile(root + '/' + name,
  JSON.stringify(value, null, 2), { flag: 'wx' });
const before = await read('before.json');
const prepared = await read('prepared.json');
const baselineFunctions = evidenceArray(before.functions);
const baselineSecrets = evidenceArray(before.secrets);
const manifest = evidenceAssets(prepared.after);
const baselineManifest = evidenceAssets(prepared.before);
const normalize = (text: string) => text.replaceAll('\r\n', '\n');
async function unchangedBoundaries() {
  const current = functions();
  assert.deepEqual(current.filter(x => x.slug !== slug), baselineFunctions.filter(x => x.slug !== slug));
  assertSecretDigestsUnchanged(secrets(), baselineSecrets);
  for (const site of evidenceArray(before.sites)) {
    const response = await fetch(evidenceText(site.url), { signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, site.status);
    assert.equal(hash(await response.text()), site.sha256, 'Public site content changed');
  }
  return current;
}
async function assertPackage(directory: string, expected: typeof manifest) {
  assert.deepEqual(await inventory(root + '/' + directory + '/supabase/functions'), expected);
  assert.equal(hash(await readFile(root + '/' + directory + '/supabase/config.toml')), prepared.candidateConfig);
}
async function compareDownload(directory: string, expected: typeof manifest, packageName: string) {
  await mkdir(root + '/' + directory, { recursive: true });
  cli(['functions', 'download', slug, '--project-ref', ref, '--use-api', '--workdir', root + '/' + directory], false);
  const downloaded = await inventory(root + '/' + directory + '/supabase/functions');
  assert.deepEqual(downloaded.map(x => x.path), expected.map(x => x.path));
  for (const asset of expected) {
    const path = '/supabase/functions/' + asset.path;
    assert.equal(normalize(await readFile(root + '/' + directory + path, 'utf8')),
      normalize(await readFile(root + '/' + packageName + path, 'utf8')), 'Deployed module mismatch: ' + asset.path);
  }
}
if (mode === 'deploy') {
  await assertPackage('candidate', manifest);
  await assertPackage('rollback', baselineManifest);
  assert.equal(hash(await readFile(root + '/runtime-tests.tap')), prepared.testOutputSha256);
  assert.deepEqual(await unchangedBoundaries(), baselineFunctions);
  // Re-download immediately before release so the preserved rollback is current.
  await compareDownload('predeploy', baselineManifest, 'rollback');
  await save('deploy-started.json', { at: new Date().toISOString(), slug, priorVersion: 23, health: await health() });
  cli(['functions', 'deploy', slug, '--project-ref', ref, '--use-api', '--workdir', root + '/candidate'], false);
  await save('deployed.json', { at: new Date().toISOString(), employee: functions().find(x => x.slug === slug) });
  console.log('Employee-only runtime uploaded. Run verify before declaring success.');
}
if (mode === 'verify') {
  await assertPackage('candidate', manifest);
  await compareDownload('deployed-download', manifest, 'candidate');
  const current = await unchangedBoundaries();
  const employee = current.find(x => x.slug === slug);
  assert.ok(employee && employee.status === 'ACTIVE' && employee.verify_jwt === false);
  assert.equal(employee.version, 24);
  const origin = 'https://admin.dojipro.com';
  const synthetic = randomBytes(32).toString('base64url');
  const cases = [
    { name: 'absent cookie', path: '/auth/logout', status: 200 },
    { name: 'repeated absent-cookie logout', path: '/auth/logout', status: 200 },
    { name: 'nonexistent synthetic session', path: '/auth/logout', status: 200, cookie: '__Host-doji_employee=' + synthetic },
    { name: 'malformed cookie denied', path: '/auth/logout', status: 401, cookie: '__Host-doji_employee=invalid' },
    { name: 'foreign origin denied', path: '/auth/logout', status: 403, origin: 'https://other.invalid' },
    { name: 'unauthenticated session denied', path: '/api/session', status: 401, method: 'GET' },
  ];
  const checks = [];
  for (const item of cases) {
    const response = await fetch(origin + item.path, {
      method: item.method || 'POST', redirect: 'manual', signal: AbortSignal.timeout(20000),
      headers: { origin: item.origin || origin, 'content-type': 'application/json',
        ...(item.cookie ? { cookie: item.cookie } : {}) },
      ...(item.method === 'GET' ? {} : { body: '{}' }),
    });
    assert.equal(response.status, item.status, item.name);
    if (item.status === 200) {
      assert.deepEqual(await response.json(), { signedIn: false });
      assert.match(response.headers.get('set-cookie') || '', /__Host-doji_employee=;.*Max-Age=0/);
      assert.match(response.headers.get('cache-control') || '', /no-store/);
    } else await response.arrayBuffer();
    checks.push({ name: item.name, status: response.status });
  }
  const result = { at: new Date().toISOString(), employee, checks, health: await health(),
    unchangedOtherFunctionsAndSecrets: true, unchangedPublicSiteContent: true, exactRuntimeVerified: true };
  await save('verified.json', result);
  console.log(JSON.stringify(result));
}
if (mode === 'rollback') {
  await assertPackage('rollback', baselineManifest);
  await compareDownload('rollback-preflight', manifest, 'candidate');
  await unchangedBoundaries();
  cli(['functions', 'deploy', slug, '--project-ref', ref, '--use-api', '--workdir', root + '/rollback'], false);
  await compareDownload('rollback-verified', baselineManifest, 'rollback');
  await save('rolled-back.json', { at: new Date().toISOString(), employee: functions().find(x => x.slug === slug) });
  console.log('Employee-only rollback restored and verified.');
}
