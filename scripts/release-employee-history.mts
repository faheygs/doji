// Owner-approved, separately scoped history/timestamp release. No domain commands.
import assert from 'node:assert/strict';
import { access, mkdir, readFile, writeFile, cp } from 'node:fs/promises';
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
  assertSecretDigestsUnchanged,
  body,
} from './staff-workflow-release-guards.mts';
export const root = 'test-results/employee-history-release-20261009';
const runtime = 'test-results/employee-history-integration-20261009-v2';
const site = 'test-results/admin-history-site-20261009-v2';
const slug = 'employee-portal-v2';
const read = async (path: string) => evidenceRecord(JSON.parse(await readFile(path, 'utf8')));
const save = (name: string, value: unknown) =>
  writeFile(root + '/' + name + '.json', JSON.stringify(value, null, 2), { flag: 'wx' });
const query = (sql: string) =>
  evidenceRows(
    cli(['db', 'query', sql, '--linked', '--workdir', linkedWorkspace, '--output-format', 'json']),
  );
const names = [
  'get_admin_personal_work_page_v1',
  'get_admin_announcement_lifecycle_page_v1',
  'history_reads_actor',
  'employee_history_rpc_v1',
];
const select = contractSelect
  .replace(/and p.proname not in\([^)]*\)/, "and p.proname not in('" + names.join("','") + "')")
  .replaceAll("'business_session_private'", "'business_session_private','staff_workflow_private'");
const fingerprint = `select md5((${select})::text)`;
const snapshot = () =>
  evidenceRecord(
    query(`begin read only;set local statement_timeout='8s';
 do $$begin ${windowGuard} end$$;
 select jsonb_build_object('hash',(${fingerprint}),
 'installed',(select count(*) from pg_proc where proname in('${names.join("','")}')),
 'workflow',(select to_jsonb(s)-'history_reads_enabled' from staff_workflow_private.settings s),
 'history_enabled',(select coalesce((to_jsonb(s)->>'history_reads_enabled')::boolean,false) from staff_workflow_private.settings s),
 'triggers',(select md5(string_agg(pg_get_triggerdef(oid),'|' order by oid)) from pg_trigger where not tgisinternal),
 'lock_waits',(select count(*) from pg_stat_activity where backend_type='client backend' and wait_event_type='Lock'),
 'sources',(select jsonb_agg(jsonb_build_object('name',c.oid::regclass::text,'estimated_rows',c.reltuples,'bytes',pg_total_relation_size(c.oid))) from pg_class c where c.oid in(
 'public.reports'::regclass,'public.moderation_appeals'::regclass,'public.challenge_suggestions'::regclass,'business_private.applications'::regclass,
 'public.safety_removal_cases'::regclass,'business_private.privacy_cases'::regclass,'public.app_announcements'::regclass)),
 'staff_source',(select prosrc from pg_proc where oid='public.get_admin_staff_work_page_v1(text,text,text,integer,timestamptz,text)'::regprocedure)
 ) state;rollback;`)[0]?.state,
  );
const sourcePaths = [
  'supabase/overlays/employee_history_reads_v1.sql',
  'supabase/overlays/employee_history_bridge_v1.sql',
  'supabase/overlays/employee_history_reads_v1.rollback.sql',
  'supabase/overlays/employee_history_bridge_v1.rollback.sql',
];
const sources = () =>
  Promise.all(sourcePaths.map(async (path) => ({ path, sha256: hash(await readFile(path)) })));
async function pageConfig() {
  const result: Record<string, string> = {};
  for (const name of ['doji-admin', 'doji-business', 'doji-site'])
    result[name] = hash(
      JSON.stringify(evidenceRecord(await cf('/pages/projects/' + name)).deployment_configs),
    );
  return result;
}
async function guard(version: number, installed: number, enabled: boolean, siteChanged = false) {
  const before = await read(root + '/before.json');
  const now = functions(),
    prior = evidenceArray(before.functions);
  assert.equal(now.length, prior.length);
  for (const item of prior) {
    const actual = now.find((f) => f.id === item.id);
    assert.ok(actual);
    if (item.slug === slug) {
      assert.equal(actual.version, version);
      assert.equal(actual.status, 'ACTIVE');
    } else assert.deepEqual(actual, item, 'Unrelated function drift');
  }
  assertSecretDigestsUnchanged(secrets(), evidenceArray(before.secrets));
  assert.deepEqual(await pageConfig(), before.pageConfig);
  const current = await pages();
  for (const name of ['doji-admin', 'doji-business', 'doji-site'])
    if (!siteChanged || name !== 'doji-admin')
      assert.deepEqual(current[name], evidenceRecord(before.pages)[name]);
  const db = snapshot(),
    old = evidenceRecord(before.database);
  for (const key of ['hash', 'workflow', 'triggers', 'staff_source'])
    assert.deepEqual(db[key], old[key], 'Database drift: ' + key);
  assert.equal(db.installed, installed);
  assert.equal(db.history_enabled, enabled);
  assert.equal(db.lock_waits, 0);
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
const mode = process.argv[2];
assert.ok(
  [
    'preflight',
    'database',
    'edge-off',
    'edge-on',
    'enable',
    'prepare-acceptance',
    'test-acceptance',
    'acceptance',
    'promote',
    'verify',
  ].includes(String(mode)),
);
if (mode === 'preflight') {
  await assert.rejects(access(root));
  const runtimeTest = await read(runtime + '/tested.json'),
    siteTest = await read(site + '/tested.json');
  for (const enabled of [false, true]) {
    assert.deepEqual(
      await inventory(runtime + (enabled ? '/employee-on' : '/employee-off')),
      runtimeTest[enabled ? 'on' : 'off'],
    );
    assert.deepEqual(
      await inventory(site + (enabled ? '/site-on' : '/site-off')),
      siteTest[enabled ? 'on' : 'off'],
    );
  }
  const db = snapshot();
  assert.equal(db.installed, 0);
  assert.equal(db.history_enabled, false);
  assert.equal(db.lock_waits, 0);
  const baselineSource = (await readFile('supabase/overlays/staff_workflow_extended_v1.sql', 'utf8'))
    .replaceAll('\r\n', '\n')
    .match(
      /create function public\.get_admin_staff_work_page_v1\([\s\S]*?as \$\$([\s\S]*?)end\$\$;/,
    )?.[1];
  assert.ok(baselineSource);
  assert.equal(
    String(db.staff_source).trim(),
    (baselineSource + 'end').trim(),
    'Live staff read differs from tested source',
  );
  for (const row of evidenceArray(db.sources))
    assert.ok(Number(row.estimated_rows) <= 5000, 'Source exceeds local volume qualification');
  const currentPages = await pages();
  assert.deepEqual(
    currentPages,
    (await read('test-results/react-admin-autofill-20261009/verified.json')).pages,
  );
  const fs = functions();
  assert.equal(fs.find((f) => f.slug === slug)?.version, 17);
  const qualified = await read('test-results/employee-history-reads-20261009/verified.json');
  assert.equal(
    hash((await readFile(sourcePaths[0]!, 'utf8')).replaceAll('\r\n', '\n')),
    qualified.candidateSha256,
  );
  await mkdir(root);
  await mkdir(root + '/runtime-before');
  cli(
    [
      'functions',
      'download',
      slug,
      '--project-ref',
      ref,
      '--use-api',
      '--workdir',
      root + '/runtime-before',
    ],
    false,
  );
  const rollback = 'test-results/employee-health-timestamp-20261009/rollback';
  for (const asset of (await inventory(rollback)).filter((a) =>
    a.path.startsWith('supabase/functions/'),
  )) {
    const normalized = async (dir: string) =>
      (await readFile(dir + '/' + asset.path, 'utf8')).replaceAll('\r\n', '\n');
    assert.equal(
      await normalized(root + '/runtime-before'),
      await normalized(rollback),
      'Deployed source drift: ' + asset.path,
    );
  }
  await save('before', {
    at: new Date().toISOString(),
    database: db,
    functions: fs,
    secrets: secrets(),
    pages: currentPages,
    pageConfig: await pageConfig(),
    sources: await sources(),
    runtimeTest,
    siteTest,
    rollbackRuntime: root + '/runtime-before',
    rollbackSite: 'test-results/react-admin-autofill-20261009/site',
    boundaries: await health(),
  });
  await guard(17, 0, false);
  console.log(
    JSON.stringify({
      preflight: 'passed',
      productionChanged: false,
      sourceVolumes: db.sources,
      lockWaits: db.lock_waits,
      runtimeVersion: 17,
    }),
  );
} else if (mode === 'database') {
  const before = await guard(17, 0, false);
  const expected = String(evidenceRecord(before.database).hash);
  assert.match(expected, /^[a-f0-9]{32}$/);
  const preserve = `if (${fingerprint})<>'${expected}' then raise exception 'Existing contract drift';end if;`;
  const install = (await Promise.all(sourcePaths.slice(0, 2).map((p) => readFile(p, 'utf8'))))
    .map(body)
    .join('\n');
  const sql = `begin;set local lock_timeout='2s';set local statement_timeout='8s';
 do $$begin ${windowGuard} ${preserve}
 if not pg_try_advisory_xact_lock(hashtextextended('employee-history-release-v1',0)) then raise exception 'Concurrent release';end if;end$$;
 ${install}
 do $$begin ${preserve}
 if (select history_reads_enabled from staff_workflow_private.settings where singleton) then raise exception 'Must start disabled';end if;
 if has_function_privilege('authenticated','public.get_admin_personal_work_page_v1(text,text,integer,timestamptz,text)','execute')
 or has_function_privilege('anon','public.get_admin_announcement_lifecycle_page_v1(text,integer,timestamptz,uuid)','execute')
 or has_function_privilege('service_role','public.get_admin_personal_work_page_v1(text,text,integer,timestamptz,text)','execute')
 or has_function_privilege('authenticated','portal_identity_private.employee_history_rpc_v1(text,text,text,text,boolean,text,jsonb)','execute')
 or not has_function_privilege('doji_employee_application','portal_identity_private.employee_history_rpc_v1(text,text,text,text,boolean,text,jsonb)','execute') then raise exception 'Invalid grants';end if;end$$;
 select true installed;commit;`;
  await writeFile(root + '/install.sql', sql, { flag: 'wx' });
  await save('database-started', { at: new Date().toISOString(), sha256: hash(sql) });
  query(sql);
  await guard(17, 4, false);
  await save('database-verified', {
    at: new Date().toISOString(),
    existingContractsPreserved: true,
    enabled: false,
  });
  console.log('Additive history reads installed disabled; existing contracts preserved.');
} else if (mode === 'edge-off' || mode === 'edge-on') {
  const enabled = mode === 'edge-on',
    prior = enabled ? 18 : 17;
  await read(root + '/database-verified.json');
  if (enabled) await read(root + '/edge-off-verified.json');
  await guard(prior, 4, false);
  const output = runtime + (enabled ? '/employee-on' : '/employee-off');
  const manifest = (await read(runtime + '/tested.json'))[enabled ? 'on' : 'off'];
  assert.deepEqual(await inventory(output), manifest);
  await save(mode + '-started', { at: new Date().toISOString(), assets: manifest });
  cli(['functions', 'deploy', slug, '--project-ref', ref, '--use-api', '--workdir', output], false);
  await guard(prior + 1, 4, false);
  const downloaded = root + '/' + mode + '-download';
  await mkdir(downloaded);
  cli(
    ['functions', 'download', slug, '--project-ref', ref, '--use-api', '--workdir', downloaded],
    false,
  );
  for (const asset of evidenceAssets(manifest).filter((a) =>
    a.path.startsWith('supabase/functions/'),
  )) {
    const normalize = async (dir: string) =>
      (await readFile(dir + '/' + asset.path, 'utf8')).replaceAll('\r\n', '\n');
    assert.equal(
      await normalize(downloaded),
      await normalize(output),
      'Deployed source mismatch: ' + asset.path,
    );
  }
  await boundary();
  await save(mode + '-verified', {
    at: new Date().toISOString(),
    version: prior + 1,
    sourceVerified: true,
  });
  console.log('Employee runtime verified, version ' + (prior + 1));
} else if (mode === 'enable') {
  await read(root + '/edge-on-verified.json');
  const before = await guard(19, 4, false);
  const expected = String(evidenceRecord(before.database).hash);
  assert.match(expected, /^[a-f0-9]{32}$/);
  await save('enable-started', { at: new Date().toISOString() });
  query(`begin;set local lock_timeout='2s';set local statement_timeout='8s';do $$begin ${windowGuard}
 if (${fingerprint})<>'${expected}' then raise exception 'Contract drift';end if;
 if (select history_reads_enabled from staff_workflow_private.settings where singleton) then raise exception 'Already enabled';end if;end$$;
 update staff_workflow_private.settings set history_reads_enabled=true where singleton;
 select true enabled;commit;`);
  await guard(19, 4, true);
  await save('enable-verified', { at: new Date().toISOString() });
  console.log('Employee history gate enabled; production portal still on prior controls.');
} else if (mode === 'prepare-acceptance') {
  const tested = await read(site + '/tested.json');
  assert.deepEqual(await inventory(site + '/site-on'), tested.on);
  const output = root + '/acceptance';
  await assert.rejects(access(output));
  await cp(site + '/site-on', output, { recursive: true, errorOnExist: true, force: false });
  const baseline = 'test-results/react-admin-autofill-20261009/site';
  for (const path of ['index.html', 'react-admin-config.js'])
    await cp(baseline + '/' + path, output + '/' + path);
  const config = '/react-admin/20261009e/acceptance-config.js';
  await cp(site + '/site-on/react-admin-config.js', output + config, {
    errorOnExist: true,
    force: false,
  });
  const html = await readFile(output + '/connected.html', 'utf8');
  assert.equal(html.split('/react-admin-config.js').length, 2);
  await writeFile(output + '/connected.html', html.replace('/react-admin-config.js', config));
  for (const path of ['index.html', 'react-admin-config.js', '_headers', '_worker.js'])
    assert.equal(
      hash(await readFile(output + '/' + path)),
      hash(await readFile(baseline + '/' + path)),
    );
  await save('acceptance-prepared', {
    at: new Date().toISOString(),
    assets: await inventory(output),
    mainEntryUnchanged: true,
  });
  console.log('Local acceptance package prepared; main entry stays unchanged.');
} else if (mode === 'test-acceptance') {
  const prepared = await read(root + '/acceptance-prepared.json');
  assert.deepEqual(await inventory(root + '/acceptance'), prepared.assets);
  execFileSync(
    process.execPath,
    [
      'web/node_modules/@playwright/test/cli.js',
      'test',
      '--config=web/playwright.design.config.ts',
      'history-connected.spec.ts',
      'root-release.spec.ts',
      '--workers=2',
      '--output=' + root + '/browser-acceptance',
    ],
    {
      stdio: 'inherit',
      timeout: 120000,
      env: {
        ...process.env,
        DOJI_REACT_RELEASE_DIR: root + '/acceptance',
        DOJI_REACT_ROOT_RELEASE: '1',
      },
    },
  );
  await save('acceptance-tested', { at: new Date().toISOString(), assets: prepared.assets });
} else if (mode === 'acceptance' || mode === 'promote') {
  const promote = mode === 'promote';
  await read(root + '/enable-verified.json');
  await guard(19, 4, true, promote);
  if (promote) {
    await read(root + '/hosted-acceptance.json');
    assert.deepEqual(await pages(), (await read(root + '/acceptance-deployed.json')).pages);
  }
  const output = promote ? site + '/site-on' : root + '/acceptance';
  const assets = promote
    ? (await read(site + '/tested.json')).on
    : (await read(root + '/acceptance-tested.json')).assets;
  assert.deepEqual(await inventory(output), assets);
  await save(mode + '-started', { at: new Date().toISOString(), assets });
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
        promote
          ? 'Enable qualified employee history and consistent queues'
          : 'Qualify employee history at connected entry; preserve homepage',
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 180000,
        env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account },
      },
    );
  } catch {
    throw Error('Pages deployment outcome uncertain; inspect before retry.');
  }
  await save(mode + '-deployed', { at: new Date().toISOString(), pages: await pages() });
  await guard(19, 4, true, true);
  console.log(mode + ' package deployed; verification required.');
} else {
  await guard(19, 4, true, true);
  let promoted = false;
  try {
    await access(root + '/promote-deployed.json');
    promoted = true;
  } catch {}
  const label = promoted ? 'promote' : 'acceptance';
  assert.deepEqual(await pages(), (await read(root + '/' + label + '-deployed.json')).pages);
  const assets = evidenceAssets((await read(root + '/' + label + '-started.json')).assets);
  for (const asset of assets.filter(
    (a) =>
      ['index.html', 'connected.html', 'react-admin-config.js', 'admin-portal/index.html'].includes(
        a.path,
      ) || a.path.startsWith('react-admin/20261009e/'),
  )) {
    const r = await fetch(
      'https://admin.dojipro.com/' + (asset.path === 'index.html' ? '' : asset.path),
      { cache: 'no-store', signal: AbortSignal.timeout(15000) },
    );
    assert.equal(r.status, 200);
    assert.equal(hash(Buffer.from(await r.arrayBuffer())), asset.sha256, asset.path);
    if (asset.path === 'index.html' || asset.path.endsWith('config.js'))
      assert.equal(r.headers.get('cache-control'), 'no-store');
  }
  await boundary();
  await save(label + '-verified', {
    at: new Date().toISOString(),
    boundaries: await health(),
    allNewAssetsVerified: true,
    unrelatedSystemsUnchanged: true,
  });
  console.log(label + ' assets, auth boundary and unchanged systems verified.');
}
