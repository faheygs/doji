// Static-only hosted acceptance: current root, proxy, provider policy and other sites remain unchanged.
import assert from 'node:assert/strict';
import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { cf, hash, inventory, account } from './prepare-safety-launch.mts';
import { evidenceRecord, evidenceAssets } from './release-evidence.mts';
import type { PagesReleaseProject } from './release-evidence.mts';

const root = 'test-results/react-admin-hosted-20261009-v3';
const output = root + '/site';
const baseline = 'test-results/react-admin-hosted-20261009-v2';
const assetPrefix = 'react-admin/20261009b/';
const candidate = 'web/apps/admin/dist/connected';
const mode = process.argv[2];
assert.ok(['prepare', 'test', 'deploy', 'verify'].includes(String(mode)));
const read = async (path: string) => evidenceRecord(JSON.parse(await readFile(path, 'utf8')));
const save = (name: string, data: unknown) =>
  writeFile(root + '/' + name + '.json', JSON.stringify(data, null, 2), { flag: 'wx' });
async function projects() {
  const result: Record<string, { id: string; configHash: string; status: string }> = {};
  for (const name of ['doji-admin', 'doji-business', 'doji-site']) {
    const project = await cf<PagesReleaseProject & { deployment_configs: unknown }>(
      '/pages/projects/' + name,
    );
    assert.ok(project.canonical_deployment);
    result[name] = {
      id: project.canonical_deployment.id,
      configHash: hash(JSON.stringify(project.deployment_configs)),
      status: project.canonical_deployment.latest_stage.status,
    };
  }
  return result;
}
async function liveAsset(path: string, expected: string) {
  const response = await fetch('https://admin.dojipro.com/' + path, {
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 200, path);
  assert.equal(
    hash(Buffer.from(await response.arrayBuffer())),
    expected,
    'Live asset mismatch: ' + path,
  );
}
await mkdir(root, { recursive: true });
if (mode === 'prepare') {
  await assert.rejects(access(root + '/prepared.json'));
  const prior = await read(baseline + '/deployed.json');
  const old = evidenceAssets((await read(baseline + '/prepared.json')).assets);
  assert.deepEqual(await inventory(baseline + '/site'), old, 'Rollback artifact changed');
  const before = await projects();
  for (const [name, project] of Object.entries(before))
    assert.equal(
      project.id,
      evidenceRecord(evidenceRecord(prior.projects)[name]).id,
      'Newer release: ' + name,
    );
  for (const path of [
    'index.html',
    'admin-portal/index.html',
    'admin-portal/admin-app-20261002d.js',
  ])
    await liveAsset(path, old.find((asset) => asset.path === path)!.sha256);
  execFileSync(process.execPath, ['web/tests/connected-artifacts.ts'], {
    stdio: 'inherit',
    timeout: 30000,
  });
  const bundle = await readFile(baseline + '/site/admin-portal/admin-app-20261002d.js', 'utf8');
  const match = bundle.match(/window\.DOJI_PORTAL_CONFIG = Object\.freeze\((\{[\s\S]*?\})\);/);
  assert.ok(match?.[1]);
  const config = evidenceRecord(JSON.parse(match[1]));
  assert.equal(config.independentEmployeeIdentity, true);
  assert.equal(config.staffWorkflowEnabled, true);
  const publicConfig = Object.fromEntries(
    [
      'independentEmployeeIdentity',
      'staffWorkflowEnabled',
      'businessApplicationsEnabled',
      'businessPrivacyEnabled',
    ].map((key) => {
      assert.equal(typeof config[key], 'boolean');
      return [key, config[key]];
    }),
  );
  await cp(baseline + '/site', output, { recursive: true, errorOnExist: true, force: false });
  await mkdir(output + '/' + assetPrefix + 'assets', { recursive: true });
  for (const asset of await inventory(candidate)) {
    if (asset.path === 'connected.html') continue;
    const destination = asset.path.startsWith('assets/') ? assetPrefix + asset.path : asset.path;
    const priorAsset = old.find((item) => item.path === destination);
    if (priorAsset) {
      assert.equal(asset.sha256, priorAsset.sha256, 'Asset collision: ' + asset.path);
      continue;
    }
    assert.ok(
      asset.path === 'connected.html' ||
        asset.path === 'doji-icon.png' ||
        /^assets\/[\w.-]+\.js$/.test(asset.path),
      'Unexpected candidate asset',
    );
    await cp(candidate + '/' + asset.path, output + '/' + destination, {
      errorOnExist: true,
      force: false,
    });
  }
  let html = await readFile(candidate + '/connected.html', 'utf8');
  assert.ok(!html.includes('DOJI_REACT_ADMIN_CONFIG'));
  html = html.replace('<head>', '<head>\n    <script src="/react-admin-config.js"></script>');
  await writeFile(output + '/connected.html', html);
  await writeFile(
    output + '/react-admin-config.js',
    'window.DOJI_REACT_ADMIN_CONFIG = Object.freeze(' + JSON.stringify(publicConfig) + ');\n',
    { flag: 'w' },
  );
  await writeFile(
    output + '/_headers',
    (await readFile(baseline + '/site/_headers', 'utf8')) +
      '\n/connected\n  Cache-Control: no-store\n',
  );
  const assets = await inventory(output);
  for (const asset of old)
    if (!['_headers', 'connected.html'].includes(asset.path))
      assert.equal(
        assets.find((item) => item.path === asset.path)?.sha256,
        asset.sha256,
        'Existing asset changed: ' + asset.path,
      );
  const added = assets
    .filter(
      (item) =>
        item.path === 'connected.html' || !old.some((priorAsset) => priorAsset.path === item.path),
    )
    .map((item) => item.path);
  await save('prepared', {
    at: new Date().toISOString(),
    before,
    assets,
    added,
    config: publicConfig,
    rollback: baseline + '/site',
    rootUnchanged: true,
    proxyUnchanged: true,
  });
  console.log(
    JSON.stringify({ root, added: added.length, rootUnchanged: true, proxyUnchanged: true }),
  );
} else {
  const prepared = await read(root + '/prepared.json');
  assert.deepEqual(await inventory(output), prepared.assets, 'Prepared artifact changed');
  if (mode === 'test') {
    execFileSync(
      process.execPath,
      [
        'web/node_modules/@playwright/test/cli.js',
        'test',
        '--config=web/playwright.config.ts',
        'business-record.spec.ts',
        'announcements-connected.spec.ts',
        'operations-connected.spec.ts',
        '--workers=3',
      ],
      {
        stdio: 'inherit',
        timeout: 180000,
        env: { ...process.env, DOJI_REACT_RELEASE_DIR: output, NEXT_TELEMETRY_DISABLED: '1' },
      },
    );
    await save('tested', {
      at: new Date().toISOString(),
      assets: prepared.assets,
      productionReads: false,
    });
  } else if (mode === 'deploy') {
    assert.deepEqual((await read(root + '/tested.json')).assets, prepared.assets);
    assert.deepEqual(await projects(), prepared.before, 'Deployment baseline changed');
    await save('deploy-started', { at: new Date().toISOString() });
    try {
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
          'Add isolated React admin acceptance entry; preserve current portal',
        ],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 180000,
          env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account },
        },
      );
    } catch {
      throw Error('Deployment result unavailable; inspect cloud state before any retry.');
    }
    await save('deployed', { at: new Date().toISOString(), projects: await projects() });
    console.log(
      'React admin acceptance entry deployed; root portal preserved; verification required.',
    );
  } else {
    const actual = await projects();
    assert.deepEqual(actual, (await read(root + '/deployed.json')).projects);
    const before = evidenceRecord(prepared.before);
    for (const [name, project] of Object.entries(actual)) {
      assert.equal(project.status, 'success');
      assert.equal(project.configHash, evidenceRecord(before[name]).configHash);
      if (name !== 'doji-admin') assert.equal(project.id, evidenceRecord(before[name]).id);
    }
    const assets = evidenceAssets(prepared.assets);
    for (const asset of assets.filter(
      (item) =>
        item.path === 'index.html' ||
        item.path === 'admin-portal/index.html' ||
        (Array.isArray(prepared.added) && prepared.added.includes(item.path)),
    ))
      await liveAsset(asset.path, asset.sha256);
    for (const [origin, expected] of [
      ['https://admin.dojipro.com', 401],
      ['https://business.dojipro.com', 403],
    ] as const) {
      const response = await fetch('https://admin.dojipro.com/api/session', {
        headers: { origin },
        signal: AbortSignal.timeout(15000),
      });
      assert.equal(response.status, expected);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    const response = await fetch('https://admin.dojipro.com/connected.html', {
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const csp = response.headers.get('content-security-policy');
    assert.ok(csp?.includes("script-src 'self' https://cdn.ably.com"));
    await save('verified', {
      at: new Date().toISOString(),
      projects: actual,
      rootUnchanged: true,
      proxyUnchanged: true,
      publicBoundaryChecks: true,
      hostedEmployeeAcceptance: 'pending',
    });
    console.log(
      JSON.stringify({
        url: 'https://admin.dojipro.com/connected.html',
        rootUnchanged: true,
        assetVerification: true,
        employeeAcceptance: 'pending',
      }),
    );
  }
}
