// Restore only the approved preview route retired by the prior root cutover.
import assert from 'node:assert/strict';
import { readFile, writeFile, cp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { cf, account, hash, inventory } from './prepare-safety-launch.mts';
import { pages, functions, secrets } from './business-disabled-release-reads.mts';
import { evidenceRecord, evidenceArray, evidenceAssets } from './release-evidence.mts';
import { assertSecretDigestsUnchanged } from './staff-workflow-release-guards.mts';
const root = 'test-results/staff-workflow-release',
  mode = process.argv[2];
assert.ok(mode === 'prepare' || mode === 'deploy' || mode === 'verify');
const read = async (n: string) =>
  evidenceRecord(JSON.parse(await readFile(`${root}/${n}.json`, 'utf8')));
const save = (n: string, v: unknown) =>
  writeFile(`${root}/${n}.json`, JSON.stringify(v, null, 2), { flag: 'wx' });
const a = await read('artifacts'),
  c = await read('candidate');
await read('edge-verified');
await read('preview-started');
async function guard() {
  const fs = functions();
  for (const old of evidenceArray(c.functions)) {
    const now = fs.find((f) => f.id === old.id);
    assert.ok(now);
    if (old.slug === 'employee-portal-v2') assert.equal(now.version, 12);
    else assert.deepEqual(now, old);
  }
  assertSecretDigestsUnchanged(secrets(), evidenceArray(c.secrets));
  const p = await pages();
  for (const name of ['doji-admin', 'doji-business', 'doji-site']) {
    const project = evidenceRecord(await cf(`/pages/projects/${name}`));
    assert.equal(
      hash(JSON.stringify(project.deployment_configs)),
      evidenceRecord(c.configHashes)[name],
    );
    if (name !== 'doji-admin') assert.deepEqual(p[name], evidenceRecord(c.pages)[name]);
  }
  return p;
}
if (mode === 'prepare') {
  const before = await guard();
  assert.deepEqual(await inventory(`${root}/site-after`), a.site);
  await cp(`${root}/site-after`, `${root}/site-routed`, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  const source = await readFile(`${root}/site-routed/_redirects`, 'utf8');
  const line = '/identity/employee-preview/* / 302';
  assert.equal(source.split(line).length, 2);
  await writeFile(
    `${root}/site-routed/_redirects`,
    source.replace(new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\r?\\n?'), ''),
  );
  const site = await inventory(`${root}/site-routed`);
  for (const f of evidenceAssets(a.site))
    if (f.path !== '_redirects')
      assert.equal(site.find((x) => x.path === f.path)?.sha256, f.sha256);
  assert.equal(
    (await readFile(`${root}/site-routed/_redirects`, 'utf8')).trim(),
    '/employee-setup/* / 302',
  );
  await save('routing-candidate', {
    at: new Date().toISOString(),
    before,
    site,
    onlyChanged: '_redirects',
    removedRule: line,
  });
  console.log('Prepared removal of only the retired preview redirect.');
} else {
  assert.equal(process.argv[3], '--approved-preview');
  const r = await read('routing-candidate');
  assert.deepEqual(await inventory(`${root}/site-routed`), r.site);
  if (mode === 'deploy') {
    assert.deepEqual(await guard(), r.before);
    await save('routing-started', { at: new Date().toISOString() });
    execFileSync(
      process.execPath,
      [
        'infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js',
        'pages',
        'deploy',
        `${root}/site-routed`,
        '--project-name',
        'doji-admin',
        '--branch',
        'main',
        '--commit-dirty=true',
        '--commit-message',
        'Open approved employee preview route; retain current homepage',
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
        timeout: 180000,
        env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account },
      },
    );
  } else await read('routing-started');
  const p = await guard();
  assert.notDeepEqual(p, r.before);
  for (const path of [
    'index.html',
    'admin-portal/admin-app-20261002d.js',
    'identity/employee-preview/',
    'identity/employee-preview/admin-portal/admin-app-20261002d.js',
    'identity/employee-preview/admin-portal/workflow-workspace.js',
  ]) {
    const response = await fetch('https://admin.dojipro.com/' + path, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, 200);
    assert.ok(
      ['/' + path, ...(path === 'index.html' ? ['/'] : [])].includes(
        new URL(response.url).pathname,
      ),
    );
    assert.equal(
      hash(Buffer.from(await response.arrayBuffer())),
      evidenceAssets(r.site).find(
        (f) => f.path === (path.endsWith('/') ? path + 'index.html' : path),
      )?.sha256,
      path,
    );
  }
  for (const [origin, status] of [
    ['https://admin.dojipro.com', 401],
    ['https://business.dojipro.com', 403],
  ] as const) {
    const response = await fetch('https://admin.dojipro.com/api/session', {
      headers: { origin },
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, status);
  }
  await save('preview-verified', {
    at: new Date().toISOString(),
    pages: p,
    rootUnchanged: true,
    previewRoutingRestored: true,
    gates: false,
  });
  console.log(
    'Hosted preview route and exact assets verified; current homepage and access boundaries preserved.',
  );
}
