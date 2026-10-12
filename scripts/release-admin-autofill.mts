// Owner-approved static theme release. No auth, database or provider-policy changes.
import assert from 'node:assert/strict';
import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { cf, account, inventory, hash } from './prepare-safety-launch.mts';
import { pages, functions, secrets } from './business-disabled-release-reads.mts';
import { evidenceRecord, evidenceAssets } from './release-evidence.mts';
const root = 'test-results/react-admin-autofill-20261009';
const baseline = 'test-results/react-admin-root-20261009';
const output = root + '/site';
const candidate = 'web/apps/admin/dist/connected';
const prefix = 'react-admin/20261009d/';
const mode = process.argv[2];
assert.ok(['prepare', 'test', 'deploy', 'verify'].includes(String(mode)));
const read = async (path: string) => evidenceRecord(JSON.parse(await readFile(path, 'utf8')));
const save = (name: string, value: unknown) =>
  writeFile(root + '/' + name + '.json', JSON.stringify(value, null, 2), { flag: 'wx' });
async function configs() {
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
  assert.deepEqual(await configs(), prepared.configHashes);
  const current = await pages();
  for (const name of ['doji-admin', 'doji-business', 'doji-site'])
    if (!deployed || name !== 'doji-admin')
      assert.deepEqual(current[name], evidenceRecord(prepared.pages)[name]);
  return prepared;
}
if (mode === 'prepare') {
  await assert.rejects(access(root));
  const prior = await read(baseline + '/prepared.json');
  assert.deepEqual(await inventory(baseline + '/site'), prior.assets);
  assert.deepEqual(await pages(), (await read(baseline + '/verified.json')).pages);
  execFileSync(
    process.execPath,
    ['../../node_modules/vite/bin/vite.js', 'build', '--mode', 'connected', '--base', '/' + prefix],
    { cwd: 'web/apps/admin', stdio: 'inherit', timeout: 60000 },
  );
  await mkdir(root);
  await cp(baseline + '/site', output, { recursive: true, force: false, errorOnExist: true });
  await mkdir(output + '/' + prefix + 'assets', { recursive: true });
  const added: string[] = [];
  for (const asset of await inventory(candidate)) {
    if (asset.path === 'connected.html') continue;
    if (asset.path === 'doji-icon.png') {
      assert.equal(asset.sha256, hash(await readFile(output + '/' + asset.path)));
      continue;
    }
    assert.match(asset.path, /^assets\/[\w.-]+\.js$/);
    await cp(candidate + '/' + asset.path, output + '/' + prefix + asset.path, {
      force: false,
      errorOnExist: true,
    });
    added.push(prefix + asset.path);
  }
  let html = await readFile(candidate + '/connected.html', 'utf8');
  assert.ok(html.includes('/' + prefix));
  assert.ok(!html.includes('DOJI_REACT_ADMIN_CONFIG'));
  html = html.replace('<head>', '<head>\n<script src="/react-admin-config.js"></script>');
  for (const entry of ['index.html', 'connected.html']) await writeFile(output + '/' + entry, html);
  const assets = await inventory(output);
  for (const asset of evidenceAssets(prior.assets))
    if (!['index.html', 'connected.html'].includes(asset.path))
      assert.equal(assets.find((a) => a.path === asset.path)?.sha256, asset.sha256, asset.path);
  await save('prepared', {
    at: new Date().toISOString(),
    assets,
    added,
    pages: await pages(),
    functions: functions(),
    secrets: secrets(),
    configHashes: await configs(),
    rollback: baseline + '/site',
    change: 'MUI autofill colors only; existing proxy/config/headers retained',
  });
  console.log('Autofill package prepared; prior assets, proxy, config and headers unchanged.');
} else if (mode === 'test') {
  const prepared = await read(root + '/prepared.json');
  assert.deepEqual(await inventory(output), prepared.assets);
  execFileSync(
    process.execPath,
    [
      'web/node_modules/@playwright/test/cli.js',
      'test',
      '--config=web/playwright.design.config.ts',
      'autofill.spec.ts',
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
        'Neutral autofill styling; preserve login and backend',
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 180000,
        env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account },
      },
    );
  } catch {
    throw Error('Deployment result uncertain; inspect cloud before any retry.');
  }
  await save('deployed', { at: new Date().toISOString(), pages: await pages() });
  console.log('Autofill styling deployed; hosted verification required.');
} else {
  const prepared = await guard(true);
  assert.deepEqual(await pages(), (await read(root + '/deployed.json')).pages);
  assert.ok(Array.isArray(prepared.added));
  const paths = [
    'index.html',
    'connected.html',
    'react-admin-config.js',
    'admin-portal/index.html',
    ...prepared.added,
  ];
  for (const path of paths) {
    assert.equal(typeof path, 'string');
    const response = await fetch(
      'https://admin.dojipro.com/' + (path === 'index.html' ? '' : path),
      { cache: 'no-store', signal: AbortSignal.timeout(15000) },
    );
    assert.equal(response.status, 200);
    assert.equal(
      hash(Buffer.from(await response.arrayBuffer())),
      evidenceAssets(prepared.assets).find((a) => a.path === path)?.sha256,
      'Live asset mismatch: ' + path,
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
    allNewAssetsVerified: true,
  });
  console.log('All new assets, main entry, auth boundary and unchanged backend/sites verified.');
}
