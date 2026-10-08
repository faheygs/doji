// One static module only; preserve the verified sign-in repair and all runtimes.
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { account, cf, hash, inventory } from './prepare-safety-launch.mts';
import { pages, functions } from './business-disabled-release-reads.mts';
import { evidenceRecord, evidenceAssets } from './release-evidence.mts';
import { readBrowserSource } from '../website/browser-source.mts';

const root = 'test-results/admin-workspace-scope-20261006';
const prior = 'test-results/admin-signin-cleanup-20261006';
const output = root + '/site';
const asset = 'admin-portal/workflow-workspace.js';
const mode = process.argv[2];
assert.ok(mode && ['prepare', 'deploy', 'verify'].includes(mode));
const read = async (path: string) => evidenceRecord(JSON.parse(await readFile(path, 'utf8')));
const save = (name: string, data: unknown) =>
  writeFile(`${root}/${name}.json`, JSON.stringify(data, null, 2), { flag: 'wx' });
const configHash = async () =>
  hash(JSON.stringify(evidenceRecord(await cf('/pages/projects/doji-admin')).deployment_configs));
await mkdir(root, { recursive: true });
if (mode === 'prepare') {
  const released = await read(prior + '/verified.json');
  const manifest = await read(prior + '/prepared.json');
  const baseline = prior + '/site';
  assert.deepEqual(await inventory(baseline), manifest.assets);
  const before = await pages();
  assert.deepEqual(before, released.after, 'A newer release exists; stop.');
  const old = await readFile(`${baseline}/${asset}`, 'utf8');
  const candidate = readBrowserSource(asset);
  // Bound the repair to the view allowlist and stale-response fence.
  const expected = old
    .replace(
      '["overview", "inbox", "businesses", "suggestions", "moderation", "safety"]',
      '["overview", "inbox"]',
    )
    .replace(
      '} else root.hidden = true;',
      `} else if (!root.hidden) {
      root.hidden = true;
      generation++;
      busy = again = false;
      rows.replaceChildren();
    }`,
    );
  assert.notEqual(candidate, old);
  assert.equal(candidate, expected, 'Unexpected module change outside navigation.');
  await cp(baseline, output, { recursive: true, force: false, errorOnExist: true });
  await writeFile(`${output}/${asset}`, candidate);
  const assets = await inventory(output);
  const changed = assets
    .filter(
      (a) => evidenceAssets(manifest.assets).find((b) => b.path === a.path)?.sha256 !== a.sha256,
    )
    .map((a) => a.path);
  assert.deepEqual(changed, [asset]);
  assert.deepEqual(
    assets.map((a) => a.path),
    evidenceAssets(manifest.assets).map((a) => a.path),
  );
  await save('prepared', {
    at: new Date().toISOString(),
    before,
    assets,
    changed,
    configHash: await configHash(),
    functions: functions(),
  });
  console.log('Prepared one-module admin repair; all other assets byte-identical.');
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
          'Keep combined review queue on command center and work queue only',
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
    console.log('Admin module deployed; verification remains.');
  } else {
    const deployed = await read(root + '/deployed.json');
    const after = await pages();
    assert.deepEqual(after, deployed.after);
    assert.notDeepEqual(after['doji-admin'], evidenceRecord(prepared.before)['doji-admin']);
    for (const name of ['doji-business', 'doji-site'])
      assert.deepEqual(after[name], evidenceRecord(prepared.before)[name]);
    const response = await fetch('https://admin.dojipro.com/' + asset, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, 200);
    assert.equal(
      hash(Buffer.from(await response.arrayBuffer())),
      evidenceAssets(prepared.assets).find((a) => a.path === asset)?.sha256,
    );
    for (const [origin, status] of [
      ['https://admin.dojipro.com', 401],
      ['https://business.dojipro.com', 403],
    ] as const) {
      const r = await fetch('https://admin.dojipro.com/api/session', {
        headers: { origin },
        signal: AbortSignal.timeout(15000),
      });
      await r.body?.cancel();
      assert.equal(r.status, status);
    }
    await save('verified', {
      at: new Date().toISOString(),
      after,
      verifiedAssets: [asset],
      allOtherAssetsAndRuntimeUnchanged: true,
    });
    console.log('Exact live admin module and access boundaries verified.');
  }
}
