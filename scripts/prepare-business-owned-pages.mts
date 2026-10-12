// Offline assembly only. This script cannot deploy, enable auth, or send email.
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, sep, relative } from 'node:path';
import { hash, inventory } from './prepare-safety-launch.mts';
import { evidenceAssets, evidenceRecord, evidenceText } from './release-evidence.mts';

const root = resolve(import.meta.dirname, '..');
const [candidateInput, baselineInput] = process.argv.slice(2);
assert.equal(process.argv.length, 4);
function input(value: string | undefined, pattern: RegExp) {
  assert.ok(value);
  const folder = resolve(root, value);
  assert.ok(folder.startsWith(join(root, 'test-results') + sep) && pattern.test(folder));
  return folder;
}
const candidate = input(candidateInput, /business-owned-candidate-[A-Za-z0-9]+$/);
const baseline = input(baselineInput, /react-business-migration-[A-Za-z0-9]+$/);
const manifest = evidenceRecord(
  JSON.parse(await readFile(join(candidate, 'manifest.json'), 'utf8')),
);
assert.equal(manifest.status, 'local-components-only');
for (const [path, expected] of Object.entries(evidenceRecord(manifest.files))) {
  assert.match(path, /^[A-Za-z0-9_./-]+$/);
  assert.ok(!path.startsWith('/') && !path.split('/').includes('..'));
  assert.equal(hash(await readFile(join(candidate, path))), expected, 'Candidate changed');
}
const prepared = evidenceRecord(
  JSON.parse(await readFile(join(baseline, 'prepared.json'), 'utf8')),
);
const deployed = evidenceRecord(
  JSON.parse(await readFile(join(baseline, 'deployed.json'), 'utf8')),
);
assert.equal(prepared.kind, 'business');
const previous = join(baseline, 'site');
assert.deepEqual(
  await inventory(previous),
  evidenceAssets(prepared.assets),
  'Rollback package changed',
);
const deployment = evidenceText(evidenceRecord(evidenceRecord(deployed.after)['doji-business']).id);
await mkdir(join(root, 'test-results'), { recursive: true });
const output = await mkdtemp(join(root, 'test-results', 'business-owned-pages-'));
const site = join(output, 'site');
await cp(previous, site, { recursive: true, errorOnExist: true });
const namespace = '/react-business/owned-20261010/';
const candidateHtml = await readFile(join(candidate, 'frontend/index.html'), 'utf8');
// Vite also embeds the base in lazy import/preload code. Never rebase HTML alone.
assert.match(
  candidateHtml,
  /src="\/react-business\/owned-20261010\/assets\//,
  'Build the candidate with DOJI_BUSINESS_ASSET_BASE=/react-business/owned-20261010/',
);
await cp(join(candidate, 'frontend/assets'), join(site, namespace, 'assets'), { recursive: true });
const previousHtml = await readFile(join(previous, 'business-portal/access/index.html'), 'utf8');
const previousConfigPath = previousHtml.match(
  /src="(\/react-business\/[a-z0-9-]+\/release-config\.js)"/,
)?.[1];
assert.ok(previousConfigPath);
const previousConfig = await readFile(join(previous, previousConfigPath), 'utf8');
const previousValue = previousConfig.match(/Object\.freeze\((.+)\);/)?.[1];
assert.ok(previousValue);
const registrationUntil = evidenceText(evidenceRecord(JSON.parse(previousValue)).registrationUntil);
assert.ok(
  Number.isFinite(Date.parse(registrationUntil)) && Date.parse(registrationUntil) < Date.now(),
  'Public registration must remain closed',
);
const config = { registrationUntil, ownedAuthEnabled: false, maintenanceEnabled: false };
await writeFile(
  join(site, namespace, 'release-config.js'),
  `window.DOJI_REACT_BUSINESS_CONFIG = Object.freeze(${JSON.stringify(config)});\n`,
  { flag: 'wx' },
);
const html = candidateHtml
  .replace('Doji for Business · Migration preview', 'Doji for Business')
  .replace(
    '<head>',
    `<head><script src="${namespace}release-config.js"></script><script src="/business-portal/config.js"></script><link rel="icon" href="/doji-icon.png">`,
  );
assert.doesNotMatch(html, /="\/assets\//);
assert.match(html, /name="referrer" content="no-referrer"/);
for (const path of [
  'index.html',
  'business-portal/access/index.html',
  'business-portal/application/index.html',
])
  await writeFile(join(site, path), html);
await cp(join(candidate, 'pages-components/_worker.js'), join(site, '_worker.js'));
for (const path of [
  '_headers',
  '_routes.json',
  '_redirects',
  'business-portal/config.js',
  'business-terms/index.html',
  'business-privacy/index.html',
  'doji-icon.png',
])
  assert.equal(
    hash(await readFile(join(site, path))),
    hash(await readFile(join(previous, path))),
    `Preserved boundary changed: ${path}`,
  );
const assets = await inventory(site);
await writeFile(
  join(output, 'prepared.json'),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      status: 'offline-assembled-disabled',
      project: 'doji-business',
      deploymentBaseline: deployment,
      baseline,
      candidate,
      namespace,
      config,
      assets,
      productionBaselineRechecked: false,
      providerAcceptanceVerified: false,
      deployable: false,
      deploymentCommands: 0,
      providerCalls: 0,
    },
    null,
    2,
  ) + '\n',
  { flag: 'wx' },
);
console.log(
  JSON.stringify(
    {
      package: relative(root, output),
      files: assets.length,
      verified: true,
      deployed: false,
      providerCalls: 0,
    },
    null,
    2,
  ),
);
