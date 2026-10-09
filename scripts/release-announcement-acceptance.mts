// Owner-approved employee-only release; never creates or sends announcements.
import assert from 'node:assert/strict';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { cli, cf, ref, account, hash, inventory } from './prepare-safety-launch.mts';
import {
  functions,
  secrets,
  pages,
  linkedWorkspace,
  health,
} from './business-disabled-release-reads.mts';
import {
  evidenceRecord,
  evidenceArray,
  evidenceRows,
  evidenceAssets,
} from './release-evidence.mts';
import {
  contractSelect,
  windowGuard,
  body,
  assertSecretDigestsUnchanged,
} from './staff-workflow-release-guards.mts';
const root = 'test-results/react-admin-announcements-20261009';
const slug = 'employee-portal-v2';
const mode = process.argv[2];
assert.ok(['prepare', 'database', 'edge-off', 'edge-on', 'site', 'verify'].includes(String(mode)));
const read = async (path: string) => evidenceRecord(JSON.parse(await readFile(path, 'utf8')));
const save = (name: string, value: unknown) =>
  writeFile(root + '/' + name + '.json', JSON.stringify(value, null, 2), { flag: 'wx' });
const query = (sql: string) =>
  evidenceRows(
    cli(['db', 'query', sql, '--linked', '--workdir', linkedWorkspace, '--output-format', 'json']),
  );
const select = contractSelect
  .replace(
    /and p.proname not in\([^)]*\)/,
    "and p.proname not in('admin_announcement_compose_v1','employee_announcement_rpc_v1')",
  )
  .replaceAll("'business_session_private'", "'business_session_private','staff_workflow_private'");
const fingerprint = `select md5((${select})::text)`;
const compose = 'public.admin_announcement_compose_v1(text,uuid,text,jsonb,uuid)';
const bridge =
  'portal_identity_private.employee_announcement_rpc_v1(text,text,text,text,boolean,text,jsonb)';
const snapshot = () =>
  evidenceRecord(
    query(`begin read only;set local statement_timeout='8s';
  do $$begin ${windowGuard} end$$;
  select jsonb_build_object('hash',(${fingerprint}), 'compose',to_regprocedure('${compose}') is not null,
  'bridge',to_regprocedure('${bridge}') is not null) state;rollback;`)[0]?.state,
  );
const sourcePaths = [
  'docs/drafts/employee_announcement_compose_v1.sql',
  'docs/drafts/employee_announcement_bridge_v1.sql',
];
async function sources() {
  return Promise.all(
    sourcePaths.map(async (path) => ({ path, sha256: hash(await readFile(path)) })),
  );
}
async function pageConfig() {
  const result: Record<string, string> = {};
  for (const name of ['doji-admin', 'doji-business', 'doji-site'])
    result[name] = hash(
      JSON.stringify(evidenceRecord(await cf('/pages/projects/' + name)).deployment_configs),
    );
  return result;
}
async function guard(version: number, databaseInstalled: boolean, siteChanged = false) {
  const before = await read(root + '/release-before.json');
  const now = functions(),
    old = evidenceArray(before.functions);
  assert.equal(now.length, old.length);
  for (const item of old) {
    const actual = now.find((f) => f.id === item.id);
    assert.ok(actual);
    if (item.slug === slug) {
      assert.equal(actual.version, version);
      assert.equal(actual.status, 'ACTIVE');
    } else assert.deepEqual(actual, item, 'Unrelated function drift: ' + item.slug);
  }
  assertSecretDigestsUnchanged(secrets(), evidenceArray(before.secrets));
  assert.deepEqual(await pageConfig(), before.pageConfig);
  const actualPages = await pages();
  for (const name of ['doji-admin', 'doji-business', 'doji-site'])
    if (!siteChanged || name !== 'doji-admin')
      assert.deepEqual(actualPages[name], evidenceRecord(before.pages)[name]);
  const db = snapshot();
  assert.equal(
    db.hash,
    evidenceRecord(before.database).hash,
    'Existing database contracts changed',
  );
  assert.equal(db.compose, databaseInstalled);
  assert.equal(db.bridge, databaseInstalled);
  assert.deepEqual(await sources(), before.sources);
  return before;
}
async function boundary() {
  const r = await fetch('https://admin.dojipro.com/api/session', {
    headers: { origin: 'https://admin.dojipro.com' },
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(r.status, 401);
  assert.equal(r.headers.get('cache-control'), 'no-store');
}
if (mode === 'prepare') {
  await assert.rejects(access(root + '/release-before.json'));
  for (const name of ['gate-off', 'gate-on']) {
    const tested = await read(root + '/' + name + '-tested.json');
    assert.deepEqual(await inventory(root + '/' + name), tested.assets);
  }
  await read(root + '/runtime-tested.json');
  const fs = functions();
  assert.equal(fs.find((f) => f.slug === slug)?.version, 15);
  const db = snapshot();
  assert.equal(db.compose, false);
  assert.equal(db.bridge, false);
  const currentPages = await pages();
  assert.equal(
    evidenceRecord(currentPages['doji-admin']).id,
    'd9130763-8f5f-491e-9756-028c7c890e89',
  );
  await save('release-before', {
    at: new Date().toISOString(),
    functions: fs,
    secrets: secrets(),
    pages: currentPages,
    pageConfig: await pageConfig(),
    database: db,
    sources: await sources(),
    rollbackRuntime: root + '/employee-before',
    rollbackPortal: 'test-results/react-admin-hosted-20261009-v4/site',
  });
  console.log('Approved release preflight captured; existing functions/configuration pinned.');
} else if (mode === 'database') {
  const before = await guard(15, false);
  const expected = String(evidenceRecord(before.database).hash);
  assert.match(expected, /^[a-f0-9]{32}$/);
  const install = (await Promise.all(sourcePaths.map((p) => readFile(p, 'utf8'))))
    .map(body)
    .join('\n');
  const preserve = `if (${fingerprint})<>'${expected}' then raise exception 'Existing contract drift';end if;`;
  const sql = `begin;set local lock_timeout='2s';set local statement_timeout='8s';
  do $$begin ${windowGuard} ${preserve}
  if to_regprocedure('${compose}') is not null or to_regprocedure('${bridge}') is not null then raise exception 'Already installed';end if;end$$;
  ${install}
  do $$begin ${preserve}
  if has_function_privilege('authenticated','${compose}','execute') or has_function_privilege('anon','${compose}','execute')
    or has_function_privilege('service_role','${compose}','execute') or has_function_privilege('authenticated','${bridge}','execute')
    or not has_function_privilege('doji_employee_application','${bridge}','execute') then raise exception 'Unexpected grants';end if;end$$;
  select true as installed;commit;`;
  await writeFile(root + '/install.sql', sql, { flag: 'wx' });
  await save('database-started', { at: new Date().toISOString(), sha256: hash(sql) });
  query(sql); // Never retry an uncertain write.
  await guard(15, true);
  await save('database-verified', {
    at: new Date().toISOString(),
    existingContractsUnchanged: true,
    memberGrantsDenied: true,
  });
  console.log(
    'Two additive employee announcement functions installed; existing contracts unchanged.',
  );
} else if (mode === 'edge-off' || mode === 'edge-on') {
  const enabled = mode === 'edge-on',
    priorVersion = enabled ? 16 : 15;
  await read(root + '/database-verified.json');
  if (enabled) await read(root + '/edge-off-verified.json');
  await guard(priorVersion, true);
  const output = root + (enabled ? '/employee-on' : '/employee-off');
  const candidate = await read(output + '.json');
  assert.deepEqual(await inventory(output), candidate.assets);
  await save(mode + '-started', { at: new Date().toISOString(), assets: candidate.assets });
  cli(['functions', 'deploy', slug, '--project-ref', ref, '--use-api', '--workdir', output], false);
  await guard(priorVersion + 1, true);
  const downloaded = root + '/' + mode + '-download';
  await mkdir(downloaded);
  cli(
    ['functions', 'download', slug, '--project-ref', ref, '--use-api', '--workdir', downloaded],
    false,
  );
  for (const asset of evidenceAssets(candidate.assets).filter((a) =>
    a.path.startsWith('supabase/functions/'),
  )) {
    const normalize = async (p: string) => (await readFile(p, 'utf8')).replaceAll('\r\n', '\n');
    assert.equal(
      await normalize(downloaded + '/' + asset.path),
      await normalize(output + '/' + asset.path),
      'Deployed source differs: ' + asset.path,
    );
  }
  await boundary();
  await save(mode + '-verified', {
    at: new Date().toISOString(),
    version: priorVersion + 1,
    composeEnabled: enabled,
    unrelatedFunctionsAndSecretsUnchanged: true,
    sourceVerified: true,
  });
  console.log('Employee runtime verified; compose enabled=' + enabled);
} else if (mode === 'site') {
  await read(root + '/edge-on-verified.json');
  await guard(17, true);
  const output = root + '/gate-on',
    tested = await read(output + '-tested.json');
  assert.deepEqual(await inventory(output), tested.assets);
  await save('site-started', { at: new Date().toISOString(), assets: tested.assets });
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
      'Enable qualified React announcement acceptance; preserve main admin entry',
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 180000,
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account },
    },
  );
  await save('site-deployed', { at: new Date().toISOString(), pages: await pages() });
  console.log('Acceptance package deployed; hosted verification still required.');
} else {
  await guard(17, true, true);
  assert.deepEqual(await pages(), (await read(root + '/site-deployed.json')).pages);
  const expected = evidenceAssets((await read(root + '/gate-on.json')).assets);
  for (const asset of expected.filter(
    (a) =>
      [
        'index.html',
        'admin-portal/index.html',
        '_worker.js',
        'connected.html',
        'react-admin-config.js',
      ].includes(a.path) || a.path.startsWith('react-admin/20261009c/'),
  )) {
    if (asset.path === '_worker.js') continue;
    const response = await fetch('https://admin.dojipro.com/' + asset.path, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    // Pages worker source is deliberately not publicly served.
    assert.equal(response.status, 200);
    assert.equal(hash(Buffer.from(await response.arrayBuffer())), asset.sha256, asset.path);
  }
  await boundary();
  const responses = await health();
  await save('release-verified', {
    at: new Date().toISOString(),
    pages: await pages(),
    responses,
    mainAdminUnchanged: true,
    hostedEmployeeAcceptance: 'pending',
    liveAnnouncementWrites: 0,
  });
  console.log(
    'Acceptance assets and public boundaries verified. Authenticated acceptance remains.',
  );
}
