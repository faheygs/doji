// Offline release qualification only. No deployment, provider or database calls.
import assert from 'node:assert/strict';
import { access, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { inventory } from './prepare-safety-launch.mts';
import { evidenceAssets, evidenceRecord } from './release-evidence.mts';

const root = 'test-results/react-admin-announcements-20261009';
const baseline = 'test-results/react-admin-hosted-20261009-v4';
const candidate = 'web/apps/admin/dist/connected';
const prefix = 'react-admin/20261009c/';
const mode = process.argv[2];
assert.ok(['prepare', 'test-off', 'test-on'].includes(String(mode)));
const read = async (path: string) => evidenceRecord(JSON.parse(await readFile(path, 'utf8')));
const save = (path: string, value: unknown) =>
  writeFile(path, JSON.stringify(value, null, 2), { flag: 'wx' });

if (mode === 'prepare') {
  await assert.rejects(access(root));
  const prior = await read(baseline + '/prepared.json');
  const old = evidenceAssets(prior.assets);
  assert.deepEqual(await inventory(baseline + '/site'), old, 'Rollback artifact changed');
  const configText = await readFile(baseline + '/site/react-admin-config.js', 'utf8');
  const configMatch = configText.match(/Object\.freeze\((\{.*\})\)/);
  assert.ok(configMatch?.[1], 'Missing public baseline config');
  const config = evidenceRecord(JSON.parse(configMatch[1]));
  assert.equal(config.independentEmployeeIdentity, true);
  assert.equal(config.staffWorkflowEnabled, true);
  const html = await readFile(candidate + '/connected.html', 'utf8');
  assert.ok(html.includes('/' + prefix), 'Build must use the immutable release prefix');
  assert.ok(!html.includes('DOJI_REACT_ADMIN_CONFIG'));
  const additions = await inventory(candidate);
  await mkdir(root);
  for (const enabled of [false, true]) {
    const output = root + (enabled ? '/gate-on' : '/gate-off');
    await cp(baseline + '/site', output, { recursive: true, errorOnExist: true, force: false });
    await mkdir(output + '/' + prefix + 'assets', { recursive: true });
    for (const asset of additions) {
      if (asset.path === 'connected.html') continue;
      assert.ok(asset.path === 'doji-icon.png' || /^assets\/[\w.-]+\.js$/.test(asset.path));
      const destination = asset.path.startsWith('assets/') ? prefix + asset.path : asset.path;
      const existing = old.find((item) => item.path === destination);
      if (existing) {
        assert.equal(existing.sha256, asset.sha256, 'Asset collision');
        continue;
      }
      await cp(candidate + '/' + asset.path, output + '/' + destination, {
        force: false,
        errorOnExist: true,
      });
    }
    await writeFile(
      output + '/connected.html',
      html.replace('<head>', '<head>\n<script src="/react-admin-config.js"></script>'),
    );
    await writeFile(
      output + '/react-admin-config.js',
      'window.DOJI_REACT_ADMIN_CONFIG = Object.freeze(' +
        JSON.stringify({ ...config, announcementComposeEnabled: enabled }) +
        ');\n',
    );
    const assets = await inventory(output);
    for (const asset of old) {
      if (['connected.html', 'react-admin-config.js'].includes(asset.path)) continue;
      assert.equal(
        assets.find((item) => item.path === asset.path)?.sha256,
        asset.sha256,
        'Baseline changed: ' + asset.path,
      );
    }
    await save(output + '.json', {
      assets,
      enabled,
      rollback: baseline + '/site',
      productionChanged: false,
    });
  }
  const off = evidenceAssets((await read(root + '/gate-off.json')).assets);
  const on = evidenceAssets((await read(root + '/gate-on.json')).assets);
  assert.deepEqual(
    off.filter((a) => a.path !== 'react-admin-config.js'),
    on.filter((a) => a.path !== 'react-admin-config.js'),
  );
  console.log(
    'Two immutable local packages prepared; only the compose flag differs. No production calls.',
  );
} else {
  const enabled = mode === 'test-on';
  const output = root + (enabled ? '/gate-on' : '/gate-off');
  const prepared = await read(output + '.json');
  assert.deepEqual(await inventory(output), prepared.assets, 'Prepared bytes changed');
  const selectors = enabled
    ? ['announcement-write-connected.spec.ts']
    : (await readdir('web/tests/browser')).filter(
        (name) => name.endsWith('.spec.ts') && name !== 'announcement-write-connected.spec.ts',
      );
  // Gate-off runs the full prior portal suite; write-enabled tests are a separate pass.
  execFileSync(
    process.execPath,
    [
      'web/node_modules/@playwright/test/cli.js',
      'test',
      '--config=web/playwright.design.config.ts',
      '--workers=2',
      ...selectors,
      '--grep-invert=public homepage renders|website filled actions',
      '--output=' + output + '-browser',
    ],
    {
      stdio: 'inherit',
      timeout: 480000,
      env: { ...process.env, DOJI_REACT_RELEASE_DIR: output, NEXT_TELEMETRY_DISABLED: '1' },
    },
  );
  assert.deepEqual(await inventory(output), prepared.assets, 'Test changed prepared bytes');
  await save(output + '-tested.json', {
    at: new Date().toISOString(),
    assets: prepared.assets,
    productionReads: false,
    productionWrites: false,
  });
  console.log('Exact package qualified: ' + output);
}
