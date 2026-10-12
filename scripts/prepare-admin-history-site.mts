// Local package preparation/testing only. No cloud API, migration or deploy operation.
import assert from 'node:assert/strict';
import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { inventory, hash } from './prepare-safety-launch.mts';
import { evidenceRecord, evidenceAssets } from './release-evidence.mts';
const root = 'test-results/admin-history-site-20261009-v2';
const baseline = 'test-results/react-admin-autofill-20261009';
const candidate = 'web/apps/admin/dist/connected';
const prefix = 'react-admin/20261009e/';
const mode = process.argv[2];
assert.ok(mode === 'prepare' || mode === 'test', 'Only local prepare/test modes accepted');
const read = async (path: string) => evidenceRecord(JSON.parse(await readFile(path, 'utf8')));
if (mode === 'prepare') {
  await assert.rejects(access(root));
  const prior = await read(baseline + '/prepared.json');
  assert.deepEqual(await inventory(baseline + '/site'), prior.assets);
  execFileSync(
    process.execPath,
    ['../../node_modules/vite/bin/vite.js', 'build', '--mode', 'connected', '--base', '/' + prefix],
    { cwd: 'web/apps/admin', stdio: 'inherit', timeout: 60000 },
  );
  execFileSync(process.execPath, ['tests/connected-artifacts.ts'], {
    cwd: 'web',
    stdio: 'inherit',
    timeout: 30000,
  });
  await mkdir(root);
  const output = root + '/site-off';
  await cp(baseline + '/site', output, { recursive: true, force: false, errorOnExist: true });
  await mkdir(output + '/' + prefix + 'assets', { recursive: true });
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
  }
  let html = await readFile(candidate + '/connected.html', 'utf8');
  assert.ok(html.includes('/' + prefix));
  assert.ok(!html.includes('DOJI_REACT_ADMIN_CONFIG'));
  html = html.replace('<head>', '<head>\n<script src="/react-admin-config.js"></script>');
  for (const entry of ['index.html', 'connected.html']) await writeFile(output + '/' + entry, html);
  const off = await inventory(output);
  for (const asset of evidenceAssets(prior.assets))
    if (!['index.html', 'connected.html'].includes(asset.path))
      assert.equal(off.find((a) => a.path === asset.path)?.sha256, asset.sha256, asset.path);
  await cp(output, root + '/site-on', { recursive: true, force: false, errorOnExist: true });
  const config = await readFile(output + '/react-admin-config.js', 'utf8');
  const match = config.match(/^window\.DOJI_REACT_ADMIN_CONFIG = Object\.freeze\((\{.*\})\);\s*$/);
  assert.ok(match);
  const flags = evidenceRecord(JSON.parse(match[1]!));
  assert.ok(!Object.hasOwn(flags, 'historyReadsEnabled'));
  await writeFile(
    root + '/site-on/react-admin-config.js',
    'window.DOJI_REACT_ADMIN_CONFIG = Object.freeze(' +
      JSON.stringify({ ...flags, historyReadsEnabled: true }) +
      ');\n',
  );
  const on = await inventory(root + '/site-on');
  assert.deepEqual(
    on.filter((a) => a.path !== 'react-admin-config.js'),
    off.filter((a) => a.path !== 'react-admin-config.js'),
  );
  await writeFile(
    root + '/prepared.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        off,
        on,
        rollback: baseline + '/site',
        productionChanged: false,
        note: 'Local UI-only package plus separate acceptance flag. Proxy, CSP, legacy assets and auth settings preserved. Backend release requires separate approval.',
      },
      null,
      2,
    ),
    { flag: 'wx' },
  );
  console.log('Local history UI packages prepared; no deployment.');
} else {
  const prepared = await read(root + '/prepared.json');
  assert.deepEqual(await inventory(root + '/site-off'), prepared.off);
  assert.deepEqual(await inventory(root + '/site-on'), prepared.on);
  for (const enabled of [false, true]) {
    execFileSync(
      process.execPath,
      [
        'web/node_modules/@playwright/test/cli.js',
        'test',
        '--config=web/playwright.design.config.ts',
        ...(enabled
          ? ['history-connected.spec.ts']
          : [
              'root-release.spec.ts',
              'autofill.spec.ts',
              'announcements-connected.spec.ts',
              'announcement-write-connected.spec.ts',
              'queue-filters.spec.ts',
              'business-record.spec.ts',
              'audit-related.spec.ts',
            ]),
        '--workers=2',
        '--output=' + root + (enabled ? '/browser-on' : '/browser-off'),
      ],
      {
        stdio: 'inherit',
        timeout: 240000,
        env: {
          ...process.env,
          DOJI_REACT_RELEASE_DIR: root + (enabled ? '/site-on' : '/site-off'),
          DOJI_REACT_ROOT_RELEASE: '1',
        },
      },
    );
  }
  assert.deepEqual(await inventory(root + '/site-off'), prepared.off);
  assert.deepEqual(await inventory(root + '/site-on'), prepared.on);
  await writeFile(
    root + '/tested.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        off: prepared.off,
        on: prepared.on,
        productionChanged: false,
      },
      null,
      2,
    ),
    { flag: 'wx' },
  );
  console.log(
    'Exact off/on static packages pass local intercepted acceptance; hosted validation remains gated.',
  );
}
