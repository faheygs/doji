// Business Pages presentation only. Exact runtime/config and other sites preserved.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { account, cf, hash, inventory } from './prepare-safety-launch.mts';
import { pages } from './business-disabled-release-reads.mts';
import { evidenceRecord, evidenceAssets } from './release-evidence.mts';
import { buildBusinessIdentity } from '../website/build-business-identity.mts';
import type { BusinessIdentityConfig } from '../website/business-portal/identity/config.mts';
const accountForm = process.argv[3] === 'account-form';
const submissionForm = process.argv[3] === 'submission-form';
assert.ok(
  process.argv[3] === undefined || accountForm || submissionForm,
  'Unknown presentation release',
);
const root = submissionForm
    ? 'test-results/business-submit-default-country-20261005'
    : accountForm
      ? 'test-results/business-account-form-20261005'
      : 'test-results/business-home-20261005',
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
  assert.equal(
    evidenceRecord(before['doji-business']).id,
    submissionForm
      ? 'abe32036-41ad-4a7d-82e1-6ed17868fc84'
      : accountForm
        ? '94c0d712-faa6-4473-a5d2-83c80e7d760f'
        : '17cd269f-1431-419d-8d83-f22425f1f49f',
  );
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
          submissionForm
            ? 'test-results/business-account-form-20261005/prepared.json'
            : accountForm
              ? 'test-results/business-home-20261005/prepared.json'
              : 'test-results/business-v2-runtime-20261005/proxy-final-candidate.json',
          'utf8',
        ),
      ),
    ).assets,
  );
  const allowed = new Set(
    submissionForm
      ? [
          'business-portal/access/access.js',
          'business-portal/application/application.js',
          'business-portal/application-form.js',
        ]
      : accountForm
        ? [
            'business-portal/access/index.html',
            'business-portal/access/access.js',
            'business-portal/access/access.css',
          ]
        : [
            'index.html',
            'business-home.css',
            '_redirects',
            'robots.txt',
            'business-portal/access/index.html',
            'business-portal/access/access.js',
            'business-portal/application/index.html',
          ],
  );
  const changed = assets
    .filter((a) => previous.find((p) => p.path === a.path)?.sha256 !== a.sha256)
    .map((a) => a.path);
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
          submissionForm
            ? 'Capture all displayed business application values before save and submit'
            : accountForm
              ? 'Email-first business registration form with secure hosted setup'
              : 'Public business homepage and direct sign-in/register navigation',
        ],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 180000,
          env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account },
        },
      );
    } catch {
      throw Error('Unknown Pages deployment result. Inspect before any retry.');
    }
    await save('deployed', { at: new Date().toISOString(), after: await pages() });
    console.log('Business presentation deployed; verification next.');
  } else {
    await read('deployed');
    const now = await pages();
    for (const key of ['doji-admin', 'doji-site'])
      assert.deepEqual(now[key], evidenceRecord(prepared.before)[key]);
    const checks = [];
    for (const path of [
      '/',
      '/business-home.css',
      '/business-portal/access/',
      '/business-portal/access/access.js',
      ...(accountForm ? ['/business-portal/access/access.css'] : []),
      '/business-portal/application/',
      ...(submissionForm
        ? ['/business-portal/application/application.js', '/business-portal/application-form.js']
        : []),
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
      'Root serves verified public homepage HTTP 200; account assets and access boundaries verified; other sites unchanged.',
    );
  }
}
