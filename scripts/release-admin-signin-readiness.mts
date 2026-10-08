// Static admin-only repair. Never deploy the dirty worktree or a shared runtime.
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { account, cf, hash, inventory } from './prepare-safety-launch.mts';
import { pages, functions } from './business-disabled-release-reads.mts';
import { evidenceRecord, evidenceAssets } from './release-evidence.mts';
import { readBrowserSource } from '../website/browser-source.mts';

const cleanup = process.argv.includes('--cleanup');
const initial = 'test-results/admin-signin-readiness-20261006';
const root = cleanup ? 'test-results/admin-signin-cleanup-20261006' : initial;
const prior = cleanup ? initial : 'test-results/staff-workflow-release';
const baseline = prior + (cleanup ? '/site' : '/site-promoted-final');
const output = root + '/site';
const bundle = 'admin-portal/admin-app-20261002d.js';
const paths = cleanup
  ? [bundle, 'portal.js']
  : ['index.html', 'admin-portal/index.html', bundle, 'portal.js'];
const mode = process.argv[2];
assert.ok(mode && ['prepare', 'deploy', 'verify'].includes(mode));
const read = async (path: string) => evidenceRecord(JSON.parse(await readFile(path, 'utf8')));
const save = (name: string, data: unknown) =>
  writeFile(`${root}/${name}.json`, JSON.stringify(data, null, 2), { flag: 'wx' });
const configHash = async () =>
  hash(JSON.stringify(evidenceRecord(await cf('/pages/projects/doji-admin')).deployment_configs));
await mkdir(root, { recursive: true });
if (mode === 'prepare') {
  const released = await read(prior + (cleanup ? '/verified.json' : '/promotion-verified.json'));
  const manifest = await read(
    prior + (cleanup ? '/prepared.json' : '/promotion-final-candidate.json'),
  );
  const priorAssets = cleanup ? manifest.assets : manifest.site;
  assert.deepEqual(await inventory(baseline), priorAssets);
  const before = await pages();
  assert.deepEqual(
    before,
    cleanup ? released.after : released.pages,
    'Another release exists; do not overwrite it.',
  );
  const oldBundle = await readFile(`${baseline}/${bundle}`, 'utf8');
  const match = oldBundle.match(/window\.DOJI_PORTAL_CONFIG = Object\.freeze\((\{[\s\S]*?\})\);/);
  assert.ok(match?.[1]);
  const config = evidenceRecord(JSON.parse(match[1]));
  const buildDir = '.business-admin-qa-20261010';
  execFileSync(process.execPath, ['website/build-admin.mts'], {
    stdio: 'pipe',
    timeout: 60000,
    env: {
      ...process.env,
      DOJI_ADMIN_OUTPUT_DIR: buildDir,
      DOJI_ADMIN_ASSET_PREFIX: '',
      DOJI_ADMIN_SUPABASE_URL: String(config.supabaseUrl),
      DOJI_ADMIN_SUPABASE_ANON_KEY: String(config.supabaseAnonKey),
      DOJI_ADMIN_API_BASE_URL: String(config.apiBaseUrl),
      DOJI_ADMIN_EMPLOYEE_ACCOUNTS: String(config.employeeAccountsEnabled),
      DOJI_ADMIN_INDEPENDENT_EMPLOYEE: String(config.independentEmployeeIdentity),
      DOJI_ADMIN_STAFF_WORKFLOW_ENABLED: String(config.staffWorkflowEnabled),
      DOJI_ADMIN_EDITORIAL_ENABLED: String(config.editorialEnabled),
      DOJI_ADMIN_BUSINESS_APPLICATIONS_ENABLED: String(config.businessApplicationsEnabled),
      DOJI_ADMIN_SAFETY_REMOVAL_ENABLED: String(config.safetyRemovalEnabled),
      DOJI_ADMIN_BUSINESS_PRIVACY_ENABLED: String(config.businessPrivacyEnabled),
      DOJI_ADMIN_CAMPAIGNS_ENABLED: String(config.campaignsEnabled),
    },
  });
  const oldController = await readFile(`${baseline}/portal.js`, 'utf8');
  const newController = readBrowserSource('portal.js');
  const newJourney = readBrowserSource('admin-portal/auth-journey.js');
  const oldJourney = cleanup
    ? newJourney
    : newJourney.replace('restoring: ["Opening admin workspace"', 'restoring: ["Welcome back"');
  assert.equal(oldBundle.split(oldController).length, 2);
  assert.equal(oldBundle.split(oldJourney).length, 2);
  const candidateBundle = await readFile(`website/${buildDir}/${bundle}`, 'utf8');
  let expected = oldBundle
    .replace(oldController, () => newController)
    .replace(oldJourney, () => newJourney);
  if (cleanup) {
    const health = readBrowserSource('admin-portal/health-model.js');
    const transport = (value: string) => {
      const start = value.indexOf('var DojiEmployeeTransport =');
      const end = value.indexOf(health);
      assert.ok(start > 0 && end > start);
      return value.slice(start, end);
    };
    const oldTransport = transport(oldBundle),
      newTransport = transport(candidateBundle);
    const clear = /      clearSession\(\) \{[\s\S]*?\n      async request\(/;
    assert.ok(clear.test(oldTransport) && clear.test(newTransport));
    assert.equal(
      oldTransport.replace(clear, 'CLEAR'),
      newTransport.replace(clear, 'CLEAR'),
      'Only the browser cleanup callback may change',
    );
    expected = expected.replace(oldTransport, () => newTransport);
  }
  // Every other bundled module, configuration and authentication rule is byte-identical.
  assert.equal(candidateBundle, expected);
  await cp(baseline, output, { recursive: true, force: false, errorOnExist: true });
  for (const path of paths) await cp(`website/${buildDir}/${path}`, `${output}/${path}`);
  const assets = await inventory(output);
  const changed = assets
    .filter((a) => evidenceAssets(priorAssets).find((b) => b.path === a.path)?.sha256 !== a.sha256)
    .map((a) => a.path);
  assert.deepEqual([...changed].sort(), [...paths].sort());
  assert.deepEqual(
    assets.map((a) => a.path),
    evidenceAssets(priorAssets).map((a) => a.path),
  );
  await save('prepared', {
    at: new Date().toISOString(),
    before,
    configHash: await configHash(),
    functions: functions(),
    assets,
    changed,
  });
  console.log(JSON.stringify({ changed, serverRuntimeAndWorkerUnchanged: true }));
} else {
  const prepared = await read(root + '/prepared.json');
  assert.deepEqual(await inventory(output), prepared.assets);
  assert.equal(await configHash(), prepared.configHash);
  assert.deepEqual(functions(), prepared.functions);
  if (mode === 'deploy') {
    assert.deepEqual(await pages(), prepared.before);
    await save('deploy-started', {
      at: new Date().toISOString(),
      rollback: evidenceRecord(prepared.before)['doji-admin'],
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
          'doji-admin',
          '--branch',
          'main',
          '--commit-dirty=true',
          '--commit-message',
          'Admin sign-in readiness: prevent startup password clearing',
        ],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 180000,
          env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account },
        },
      );
    } catch {
      throw Error('Unknown deployment outcome; inspect before any retry.');
    }
    await save('deployed', { at: new Date().toISOString(), after: await pages() });
    console.log('Static admin repair deployed. Verification remains.');
  } else {
    const deployed = await read(root + '/deployed.json');
    const after = await pages();
    assert.deepEqual(after, deployed.after);
    assert.notDeepEqual(after['doji-admin'], evidenceRecord(prepared.before)['doji-admin']);
    for (const name of ['doji-business', 'doji-site'])
      assert.deepEqual(after[name], evidenceRecord(prepared.before)[name]);
    for (const path of paths) {
      const response = await fetch('https://admin.dojipro.com/' + path, {
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      });
      assert.equal(response.status, 200);
      assert.equal(
        hash(Buffer.from(await response.arrayBuffer())),
        evidenceAssets(prepared.assets).find((a) => a.path === path)?.sha256,
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
      await response.body?.cancel();
      assert.equal(response.status, status);
    }
    await save('verified', {
      at: new Date().toISOString(),
      after,
      verifiedAssets: paths,
      runtimeAndOtherSitesUnchanged: true,
    });
    console.log('Exact live admin assets and access boundaries verified.');
  }
}
