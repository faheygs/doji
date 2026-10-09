// Owner-approved static root promotion. No backend/configuration/member writes.
import assert from 'node:assert/strict';
import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { cf, account, inventory, hash } from './prepare-safety-launch.mts';
import { pages, functions, secrets } from './business-disabled-release-reads.mts';
import { evidenceRecord, evidenceAssets } from './release-evidence.mts';
const root = 'test-results/react-admin-root-20261009';
const baseline = 'test-results/react-admin-announcements-20261009';
const output = root + '/site';
const mode = process.argv[2];
assert.ok(['prepare', 'test', 'deploy', 'verify'].includes(String(mode)));
const read = async (path: string) => evidenceRecord(JSON.parse(await readFile(path, 'utf8')));
const save = (name: string, value: unknown) =>
  writeFile(root + '/' + name + '.json', JSON.stringify(value, null, 2), { flag: 'wx' });
async function configHashes() {
  const result: Record<string, string> = {};
  for (const name of ['doji-admin', 'doji-business', 'doji-site'])
    result[name] = hash(
      JSON.stringify(evidenceRecord(await cf('/pages/projects/' + name)).deployment_configs),
    );
  return result;
}
async function guard(deployed = false) {
  const prepared = await read(root + '/prepared.json');
  assert.deepEqual(await inventory(output), prepared.assets);
  assert.deepEqual(functions(), prepared.functions);
  assert.deepEqual(secrets(), prepared.secrets);
  assert.deepEqual(await configHashes(), prepared.configHashes);
  const current = await pages();
  for (const name of ['doji-admin', 'doji-business', 'doji-site'])
    if (!deployed || name !== 'doji-admin')
      assert.deepEqual(current[name], evidenceRecord(prepared.pages)[name]);
  return prepared;
}
if (mode === 'prepare') {
  await assert.rejects(access(root));
  const prior = await read(baseline + '/gate-on-tested.json');
  assert.deepEqual(await inventory(baseline + '/gate-on'), prior.assets);
  assert.deepEqual(await pages(), (await read(baseline + '/release-verified.json')).pages);
  await mkdir(root);
  await cp(baseline + '/gate-on', output, { recursive: true, force: false, errorOnExist: true });
  await cp(output + '/connected.html', output + '/index.html');
  await writeFile(
    output + '/_headers',
    (await readFile(output + '/_headers', 'utf8')) +
      '\n/\n  Cache-Control: no-store\n/index.html\n  Cache-Control: no-store\n',
  );
  const assets = await inventory(output);
  for (const asset of evidenceAssets(prior.assets))
    if (!['index.html', '_headers'].includes(asset.path))
      assert.equal(assets.find((a) => a.path === asset.path)?.sha256, asset.sha256);
  await save('prepared', {
    at: new Date().toISOString(),
    assets,
    pages: await pages(),
    functions: functions(),
    secrets: secrets(),
    configHashes: await configHashes(),
    changed: ['index.html', '_headers'],
    rollback: baseline + '/gate-on',
    liveDraftTest: 'owner declined; not passed',
  });
  console.log('Root-only candidate prepared. Backend, proxy and other entries unchanged.');
} else if (mode === 'test') {
  const prepared = await read(root + '/prepared.json');
  assert.deepEqual(await inventory(output), prepared.assets);
  execFileSync(
    process.execPath,
    [
      'web/node_modules/@playwright/test/cli.js',
      'test',
      '--config=web/playwright.design.config.ts',
      'root-release.spec.ts',
      'announcements-connected.spec.ts',
      'announcement-write-connected.spec.ts',
      'employee-realtime.spec.ts',
      '--workers=2',
      '--output=' + root + '/browser',
    ],
    {
      stdio: 'inherit',
      timeout: 180000,
      env: { ...process.env, DOJI_REACT_RELEASE_DIR: output, DOJI_REACT_ROOT_RELEASE: '1' },
    },
  );
  await save('tested', { at: new Date().toISOString(), assets: prepared.assets });
} else if (mode === 'deploy') {
  const prepared = await guard();
  assert.deepEqual((await read(root + '/tested.json')).assets, prepared.assets);
  await save('deploy-started', { at: new Date().toISOString() });
  execFileSync(
    process.execPath,
    [
      'infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js',
      'pages',
      'deploy',
      output,
      '--project-name',
      'doji-admin',
      '--branch',
      'main',
      '--commit-dirty=true',
      '--commit-message',
      'Promote qualified React admin to main entry; preserve APIs and legacy fallback',
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 180000,
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account },
    },
  );
  await save('deployed', { at: new Date().toISOString(), pages: await pages() });
  console.log('Root promoted; read-only hosted verification required.');
} else {
  const prepared = await guard(true);
  assert.deepEqual(await pages(), (await read(root + '/deployed.json')).pages);
  for (const path of [
    'index.html',
    'connected.html',
    'admin-portal/index.html',
    'react-admin-config.js',
  ]) {
    const response = await fetch(
      'https://admin.dojipro.com/' + (path === 'index.html' ? '' : path),
      { cache: 'no-store', signal: AbortSignal.timeout(15000) },
    );
    assert.equal(response.status, 200);
    assert.equal(
      hash(Buffer.from(await response.arrayBuffer())),
      evidenceAssets(prepared.assets).find((a) => a.path === path)?.sha256,
    );
    if (path === 'index.html') {
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.ok(response.headers.get('content-security-policy')?.includes("script-src 'self'"));
    }
  }
  const session = await fetch('https://admin.dojipro.com/api/session', {
    headers: { origin: 'https://admin.dojipro.com' },
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(session.status, 401);
  assert.equal(session.headers.get('cache-control'), 'no-store');
  await save('verified', {
    at: new Date().toISOString(),
    pages: await pages(),
    backendUnchanged: true,
    otherSitesUnchanged: true,
    hostedEmployeeAcceptance: 'pending',
  });
  console.log('Root HTML, cache/CSP and auth boundaries verified.');
}
