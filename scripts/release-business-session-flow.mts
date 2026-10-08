// Business static presentation only. No provider, database or shared runtime changes.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { account, cf, hash, inventory } from './prepare-safety-launch.mts';
import { pages } from './business-disabled-release-reads.mts';
import { evidenceRecord, evidenceAssets } from './release-evidence.mts';
import { buildBusinessIdentity } from '../website/build-business-identity.mts';
import type { BusinessIdentityConfig } from '../website/business-portal/identity/config.mts';

const root = 'test-results/business-session-flow-20261005',
  output = root + '/site';
const previousRoot = 'test-results/business-journey-20261005';
const changedPaths = [
  'business-portal/access/index.html',
  'business-portal/access/access.js',
  'business-portal/application/index.html',
  'business-portal/application/application.js',
];
const mode = process.argv[2];
assert.ok(mode && ['prepare', 'deploy', 'verify'].includes(mode));
const save = (name: string, value: unknown) =>
  writeFile(`${root}/${name}.json`, JSON.stringify(value, null, 2), { flag: 'wx' });
const read = async (path: string) => evidenceRecord(JSON.parse(await readFile(path, 'utf8')));
const configHash = async () =>
  hash(
    JSON.stringify(evidenceRecord(await cf('/pages/projects/doji-business')).deployment_configs),
  );
await mkdir(root, { recursive: true });
if (mode === 'prepare') {
  const previous = await read(previousRoot + '/prepared.json');
  const verified = await read(previousRoot + '/verified.json');
  const before = await pages();
  assert.deepEqual(before, verified.now, 'Stop for another deployment; do not overwrite it.');
  const source = await readFile(previousRoot + '/site/business-portal/config.js', 'utf8');
  const prefix = 'window.DOJI_BUSINESS_IDENTITY_CONFIG = Object.freeze(';
  assert.ok(source.startsWith(prefix) && source.endsWith(');\n'));
  const config: BusinessIdentityConfig = JSON.parse(source.slice(prefix.length, -3));
  await buildBusinessIdentity(output, config);
  // The working tree has a separate, unreleased admin controller change.
  // Preserve the exact previously deployed shared asset, not that local work.
  const sharedAsset = previousRoot + '/site/portal.js';
  assert.equal(
    hash(await readFile(sharedAsset)),
    evidenceAssets(previous.assets).find((a) => a.path === 'portal.js')?.sha256,
  );
  await copyFile(sharedAsset, output + '/portal.js');
  const assets = await inventory(output),
    old = evidenceAssets(previous.assets);
  const changed = assets
    .filter((a) => old.find((p) => p.path === a.path)?.sha256 !== a.sha256)
    .map((a) => a.path);
  assert.deepEqual([...changed].sort(), [...changedPaths].sort());
  assert.deepEqual(
    assets.map((a) => a.path),
    old.map((a) => a.path),
  );
  await save('prepared', {
    at: new Date().toISOString(),
    before,
    configHash: await configHash(),
    assets,
    changed,
  });
  console.log(JSON.stringify({ changed, runtimeAndConfigUnchanged: true }));
} else {
  const prepared = await read(root + '/prepared.json');
  assert.deepEqual(await inventory(output), prepared.assets);
  assert.equal(await configHash(), prepared.configHash);
  if (mode === 'deploy') {
    assert.deepEqual(await pages(), prepared.before);
    await save('deploy-started', {
      at: new Date().toISOString(),
      rollback: evidenceRecord(evidenceRecord(prepared.before)['doji-business']).id,
    });
    try {
      execFileSync(
        process.execPath,
        [
          'infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js',
          'pages',
          'deploy',
          output,
          '--project-name',
          'doji-business',
          '--branch',
          'main',
          '--commit-dirty=true',
          '--commit-message',
          'Business session continuity without duplicate page navigation',
        ],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 180000,
          env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account },
        },
      );
    } catch {
      throw Error('Unknown Pages outcome; inspect before any retry.');
    }
    await save('deployed', { at: new Date().toISOString(), after: await pages() });
    console.log('Business-only static session-flow release deployed. Verification next.');
  } else {
    const now = await pages(),
      deployed = await read(root + '/deployed.json');
    assert.deepEqual(now, deployed.after);
    for (const key of ['doji-admin', 'doji-site'])
      assert.deepEqual(now[key], evidenceRecord(prepared.before)[key]);
    const checks = [];
    for (const path of [
      '/',
      '/business-portal/access/',
      '/business-portal/application/',
      '/business-portal/access/access.js',
      '/business-portal/application/application.js',
      '/business-portal/config.js',
    ]) {
      const result = await fetch('https://business.dojipro.com' + path, {
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
      });
      assert.equal(result.status, 200, path);
      const relative =
        path === '/' ? 'index.html' : path.slice(1) + (path.endsWith('/') ? 'index.html' : '');
      assert.equal(
        hash(Buffer.from(await result.arrayBuffer())),
        evidenceAssets(prepared.assets).find((a) => a.path === relative)?.sha256,
        path,
      );
      checks.push({ path, status: result.status });
    }
    for (const [origin, expected] of [
      ['https://business.dojipro.com', 401],
      ['https://admin.dojipro.com', 403],
    ] as const) {
      const result = await fetch('https://business.dojipro.com/api/session', {
        headers: { origin },
        signal: AbortSignal.timeout(15000),
      });
      await result.body?.cancel();
      assert.equal(result.status, expected);
      checks.push({ path: origin + ' -> /api/session', status: result.status });
    }
    assert.equal(await configHash(), prepared.configHash);
    await save('verified', {
      at: new Date().toISOString(),
      now,
      checks,
      runtimeAndConfigUnchanged: true,
    });
    console.log(
      'Live assets and anonymous/cross-portal access boundaries verified. Other sites and runtime/config unchanged.',
    );
  }
}
