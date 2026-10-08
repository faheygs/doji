// Follow-up to verified unified-safety release: only browser cache identity changes.
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { cf, account, inventory, hash } from './prepare-safety-launch.mts';
import { functions, pages, database } from './business-disabled-release-reads.mts';
import { evidenceRecord, evidenceAssets } from './release-evidence.mts';
import { versionAdminWorkflow } from '../website/version-admin-workflow.mts';
const prior = 'test-results/admin-unified-safety-20261006';
const root = 'test-results/admin-unified-safety-cache-20261006-v2', output = `${root}/site`;
const mode = process.argv[2];
assert.ok(['prepare', 'test', 'deploy', 'verify'].includes(String(mode)));
const read = async (p: string) => evidenceRecord(JSON.parse(await readFile(p, 'utf8')));
const save = (n: string, v: unknown) => writeFile(`${root}/${n}.json`, JSON.stringify(v, null, 2), { flag: 'wx' });
const config = async () => hash(JSON.stringify(evidenceRecord(await cf('/pages/projects/doji-admin')).deployment_configs));
await mkdir(root, { recursive: true });
if (mode === 'prepare') {
  const priorVerified = await read('test-results/admin-unified-safety-cache-20261006/verified.json'), priorPrepared = await read(`${prior}/prepared.json`);
  assert.deepEqual(await pages(), priorVerified.pages);
  assert.deepEqual(await inventory(`${prior}/site`), priorPrepared.assets);
  await cp(`${prior}/site`, output, { recursive: true, force: false, errorOnExist: true });
  const revision = await versionAdminWorkflow(output);
  const assets = await inventory(output), old = evidenceAssets(priorPrepared.assets);
  assert.deepEqual(assets.map(a => a.path), old.map(a => a.path));
  const changed = assets.filter(a => old.find(b => b.path === a.path)?.sha256 !== a.sha256).map(a => a.path);
  const allowed = ['index.html', 'admin-portal/index.html', 'portal.js', 'admin-portal/admin-app-20261002d.js',
    ...['case', 'workspace', 'view', 'review', 'events'].map(n => `admin-portal/workflow-${n}.js`)];
  assert.ok(changed.every(p => allowed.includes(p)));
  assert.ok(changed.includes('admin-portal/workflow-workspace.js'));
  await save('prepared', { at: new Date().toISOString(), pages: priorVerified.pages, functions: functions(),
    database: database(), configHash: await config(), assets, changed, revision, rollback: `${prior}/site` });
  console.log(JSON.stringify({ revision, changed }));
} else {
  const p = await read(`${root}/prepared.json`);
  assert.deepEqual(await inventory(output), p.assets);
  if (mode === 'test') {
    execFileSync(process.execPath, ['--test', 'scripts/test-admin-workflow-versioning.mts'], { stdio: 'inherit', timeout: 30000 });
    execFileSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config',
      'website/admin-portal/playwright.workflow.config.mts', '--grep', 'built unified safety'],
    { stdio: 'inherit', timeout: 60000, env: { ...process.env, DOJI_WORKFLOW_RELEASE_DIR: output } });
    await save('tested', { at: new Date().toISOString(), assets: p.assets });
  } else {
    assert.deepEqual(functions(), p.functions);
    assert.equal(await config(), p.configHash);
    const currentDb = database();
    for (const key of ['contracts', 'roles', 'policies']) assert.equal(currentDb[key], evidenceRecord(p.database)[key]);
    if (mode === 'deploy') {
      await read(`${root}/tested.json`);
      assert.deepEqual(await pages(), p.pages);
      await save('deploy-started', { at: new Date().toISOString() });
      try {
        execFileSync(process.execPath, ['infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js',
          'pages', 'deploy', output, '--project-name', 'doji-admin', '--branch', 'main',
          '--commit-dirty=true', '--commit-message', 'Version the complete admin workflow browser module graph'],
        { stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000, env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account } });
      } catch { throw Error('Unknown deployment outcome; inspect without retry.'); }
      await save('deployed', { at: new Date().toISOString(), pages: await pages() });
      console.log('Versioned admin assets deployed; verification pending.');
    } else {
      const actual = await pages();
      assert.deepEqual(actual, (await read(`${root}/deployed.json`)).pages);
      assert.notDeepEqual(actual['doji-admin'], evidenceRecord(p.pages)['doji-admin']);
      for (const name of ['doji-business', 'doji-site']) assert.deepEqual(actual[name], evidenceRecord(p.pages)[name]);
      for (const asset of evidenceAssets(p.assets).filter(a => Array.isArray(p.changed) && p.changed.includes(a.path))) {
        const r = await fetch(`https://admin.dojipro.com/${asset.path}?v=${String(p.revision)}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
        assert.equal(r.status, 200); assert.equal(hash(Buffer.from(await r.arrayBuffer())), asset.sha256, asset.path);
      }
      await save('verified', { at: new Date().toISOString(), pages: actual, revision: p.revision, changed: p.changed,
        noRuntimeDatabaseOrOtherSiteChange: true });
      console.log('Live versioned module graph and unchanged backend verified.');
    }
  }
}
