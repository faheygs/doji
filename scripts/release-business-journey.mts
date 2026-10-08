// Business presentation only. No email candidate, database, shared Worker or auth changes.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { account, cf, hash, inventory } from './prepare-safety-launch.mts';
import { pages } from './business-disabled-release-reads.mts';
import { evidenceRecord, evidenceAssets } from './release-evidence.mts';
import { buildBusinessIdentity } from '../website/build-business-identity.mts';
import type { BusinessIdentityConfig } from '../website/business-portal/identity/config.mts';
const root = 'test-results/business-journey-20261005',
  output = root + '/site';
const mode = process.argv[2];
assert.ok(mode && ['prepare', 'deploy', 'verify'].includes(mode));
const save = (name: string, value: unknown) =>
  writeFile(`${root}/${name}.json`, JSON.stringify(value, null, 2), { flag: 'wx' });
const read = async (name: string) =>
  evidenceRecord(JSON.parse(await readFile(`${root}/${name}.json`, 'utf8')));
const configHash = async () =>
  hash(
    JSON.stringify(evidenceRecord(await cf('/pages/projects/doji-business')).deployment_configs),
  );
await mkdir(root, { recursive: true });
if (mode === 'prepare') {
  const before = await pages();
  assert.equal(evidenceRecord(before['doji-business']).id, '4a8fd4ca-2ccb-45a3-a7c2-53151c0dc3e8');
  const source = await readFile(
    'test-results/business-v2-runtime-20261005/pages-final/business-portal/config.js',
    'utf8',
  );
  const prefix = 'window.DOJI_BUSINESS_IDENTITY_CONFIG = Object.freeze(';
  assert.ok(source.startsWith(prefix) && source.endsWith(');\n'));
  const config: BusinessIdentityConfig = JSON.parse(source.slice(prefix.length, -3));
  await buildBusinessIdentity(output, config);
  const assets = await inventory(output);
  const previous = evidenceAssets(
    evidenceRecord(
      JSON.parse(
        await readFile(
          'test-results/business-submit-default-country-20261005/prepared.json',
          'utf8',
        ),
      ),
    ).assets,
  );
  const allowed = new Set([
    'business-portal/access/index.html',
    'business-portal/access/access.js',
    'business-portal/application/index.html',
    'business-portal/application/application.js',
    'business-portal/application/journey.css',
  ]);
  const changed = assets
    .filter((a) => previous.find((p) => p.path === a.path)?.sha256 !== a.sha256)
    .map((a) => a.path);
  assert.equal(changed.length, allowed.size);
  for (const path of changed) assert.ok(allowed.has(path), `Unexpected change: ${path}`);
  for (const old of previous)
    assert.ok(
      assets.some((a) => a.path === old.path),
      `Missing ${old.path}`,
    );
  await save('prepared', {
    at: new Date().toISOString(),
    before,
    configHash: await configHash(),
    assets,
    changed,
  });
  console.log(JSON.stringify({ changed, runtimeAndPublicConfigUnchanged: true }));
} else {
  const prepared = await read('prepared');
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
          'Business application journey, persistent receipt and review status',
        ],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 180000,
          env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account },
        },
      );
    } catch {
      throw Error('Unknown Pages result: inspect before any retry.');
    }
    await save('deployed', { at: new Date().toISOString(), after: await pages() });
    console.log('Business presentation deployed; verification next.');
  } else {
    const deployed = await read('deployed');
    const now = await pages();
    assert.deepEqual(now, deployed.after);
    for (const key of ['doji-admin', 'doji-site'])
      assert.deepEqual(now[key], evidenceRecord(prepared.before)[key]);
    const checks = [];
    for (const path of [
      '/',
      '/business-portal/access/',
      '/business-portal/access/access.js',
      '/business-portal/application/',
      '/business-portal/application/application.js',
      '/business-portal/application/journey.css',
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
      'Live journey assets verified; business auth/runtime and other sites unchanged. No email sender deployed.',
    );
  }
}
