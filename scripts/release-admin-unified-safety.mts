// Owner-approved staged employee read/admin UI release. Never replay failed writes.
import assert from 'node:assert/strict';
import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { cli, cf, ref, account, hash, inventory } from './prepare-safety-launch.mts';
import { pages, functions, secrets, linkedWorkspace } from './business-disabled-release-reads.mts';
import { evidenceRecord, evidenceRows, evidenceArray, evidenceAssets } from './release-evidence.mts';
import { contractSelect, windowGuard, body, assertSecretDigestsUnchanged } from './staff-workflow-release-guards.mts';
import { readBrowserSource } from '../website/browser-source.mts';

const root = 'test-results/admin-unified-safety-20261006';
const prior = 'test-results/admin-queue-consistency-20261006-v2';
const baseline = `${prior}/site`, output = `${root}/site`, slug = 'employee-portal-v2';
const oldEdge = 'test-results/staff-workflow-release/edge-role-fixed';
const runtime = `supabase/functions/${slug}/runtime/employee-workflow-contracts.mjs`;
const bundle = 'admin-portal/admin-app-20261002d.js';
const buildDir = '.business-admin-qa-20261013';
const paths = ['index.html', 'admin-portal/index.html', bundle, 'portal.js',
  'admin-portal/admin.css', 'admin-portal/workflow-workspace.js',
  'admin-portal/workflow-view.js', 'admin-portal/workflow-contracts.js'];
const mode = process.argv[2];
assert.ok(['prepare', 'test', 'browser-test', 'database', 'edge', 'edge-verify', 'enable', 'site', 'verify'].includes(String(mode)));
const read = async (path: string) => evidenceRecord(JSON.parse(await readFile(path, 'utf8')));
const save = (name: string, value: unknown) => writeFile(`${root}/${name}.json`, JSON.stringify(value, null, 2), { flag: 'wx' });
const query = (sql: string) => evidenceRows(cli(['db', 'query', sql, '--linked', '--workdir', linkedWorkspace, '--output-format', 'json']));
// Pin ALL old portal/member/staff functions, except the one replaced dispatcher.
const select = contractSelect.replace(/and p.proname not in\([^)]*\)/,
  "and p.proname not in('get_admin_safety_work_page_v1','employee_workflow_rpc_v1','employee_workflow_before_safety_v1')")
  .replaceAll("'business_session_private'", "'business_session_private','staff_workflow_private'");
const fingerprint = `select md5((${select})::text)`;
const bridge = "portal_identity_private.employee_workflow_rpc_v1(text,text,text,text,boolean,text,jsonb)";
const oldBridge = "portal_identity_private.employee_workflow_before_safety_v1(text,text,text,text,boolean,text,jsonb)";
const readSignature = 'public.get_admin_safety_work_page_v1(text,boolean,text,text,integer,timestamptz,text)';
async function configHashes() {
  const result: Record<string, string> = {};
  for (const name of ['doji-admin', 'doji-business', 'doji-site'])
    result[name] = hash(JSON.stringify(evidenceRecord(await cf(`/pages/projects/${name}`)).deployment_configs));
  return result;
}
function compile(source: string, name: string) {
  const out = ts.transpileModule(source, { fileName: name, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
      rewriteRelativeImportExtensions: true, newLine: ts.NewLineKind.LineFeed } });
  assert.ok(!out.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error));
  return out.outputText;
}
async function guard(version: number, siteChanged = false) {
  const p = await read(`${root}/prepared.json`);
  const fs = functions();
  assert.equal(fs.length, evidenceArray(p.functions).length);
  for (const old of evidenceArray(p.functions)) {
    const current = fs.find(f => f.id === old.id);
    assert.ok(current);
    if (old.slug === slug) assert.equal(current.version, version);
    else assert.deepEqual(current, old);
  }
  assertSecretDigestsUnchanged(secrets(), evidenceArray(p.secrets));
  assert.deepEqual(await configHashes(), p.configHashes);
  const currentPages = await pages();
  for (const name of ['doji-admin', 'doji-business', 'doji-site'])
    if (!siteChanged || name !== 'doji-admin') assert.deepEqual(currentPages[name], evidenceRecord(p.pages)[name]);
  const expected = String(evidenceRecord(p.database).hash);
  assert.match(expected, /^[a-f0-9]{32}$/);
  query(`begin read only;set local statement_timeout='8s';do $$begin ${windowGuard}
    if (${fingerprint})<>'${expected}' then raise exception 'Contract drift';end if;end$$;rollback;`);
  assert.deepEqual(await inventory(output), p.assets);
  assert.deepEqual(await inventory(`${root}/edge-after`), p.edge);
  return p;
}
await mkdir(root, { recursive: true });
if (mode === 'prepare') {
  await assert.rejects(access(`${root}/prepared.json`));
  const manifest = await read(`${prior}/prepared.json`);
  assert.deepEqual(await inventory(baseline), manifest.assets);
  const currentPages = await pages();
  assert.deepEqual(currentPages, (await read(`${prior}/verified.json`)).after);
  const fs = functions();
  assert.equal(fs.find(f => f.slug === slug)?.version, 14);
  const db = evidenceRecord(query(`begin read only;set local statement_timeout='8s';
    do $$begin ${windowGuard} if to_regprocedure('${oldBridge}') is not null or to_regprocedure('${readSignature}') is not null
    then raise exception 'Candidate already installed';end if;end$$;
    select jsonb_build_object('hash',(${fingerprint}),'settings',(select to_jsonb(s) from staff_workflow_private.settings s),
      'bridge',pg_get_functiondef('${bridge}'::regprocedure),'bridge_acl',(select proacl::text from pg_proc where oid='${bridge}'::regprocedure)) state;rollback;`)[0]?.state);
  assert.equal(evidenceRecord(db.settings).enabled, true);
  assert.equal(evidenceRecord(db.settings).extended_enabled, true);
  assert.equal(evidenceRecord(db.settings).events_enabled, true);
  cli(['functions', 'download', slug, '--project-ref', ref, '--use-api', '--workdir', `${root}/edge-download`], false);
  assert.deepEqual(await inventory(`${root}/edge-download/supabase/functions`), await inventory(`${oldEdge}/supabase/functions`));
  if (!await access(`${root}/edge-before`).then(() => true, () => false))
    await cp(oldEdge, `${root}/edge-before`, { recursive: true, force: false, errorOnExist: true });
  assert.deepEqual(await inventory(`${root}/edge-before`), await inventory(oldEdge));
  if (!await access(`${root}/edge-after`).then(() => true, () => false))
    await cp(oldEdge, `${root}/edge-after`, { recursive: true, force: false, errorOnExist: true });
  await writeFile(`${root}/edge-after/${runtime}`, compile(await readFile('infra/portal-identity-candidate/employee-workflow-contracts.mts', 'utf8'), 'employee-workflow-contracts.mts'));
  const edge = await inventory(`${root}/edge-after`), oldInventory = await inventory(oldEdge);
  assert.deepEqual(edge.map(f => f.path), oldInventory.map(f => f.path));
  assert.deepEqual(edge.filter(f => oldInventory.find(o => o.path === f.path)?.sha256 !== f.sha256).map(f => f.path), [runtime]);
  const oldBundle = await readFile(`${baseline}/${bundle}`, 'utf8');
  const configPattern = /window\.DOJI_PORTAL_CONFIG = Object\.freeze\((\{[\s\S]*?\})\);/;
  const match = oldBundle.match(configPattern); assert.ok(match?.[1]);
  const config = evidenceRecord(JSON.parse(match[1]));
  if (!await access(`website/${buildDir}`).then(() => true, () => false))
    execFileSync(process.execPath, ['website/build-admin.mts'], { stdio: 'pipe', timeout: 60000,
    env: { ...process.env, DOJI_ADMIN_OUTPUT_DIR: buildDir, DOJI_ADMIN_ASSET_PREFIX: '',
      DOJI_ADMIN_SUPABASE_URL: String(config.supabaseUrl), DOJI_ADMIN_SUPABASE_ANON_KEY: String(config.supabaseAnonKey),
      DOJI_ADMIN_API_BASE_URL: String(config.apiBaseUrl), DOJI_ADMIN_EMPLOYEE_ACCOUNTS: String(config.employeeAccountsEnabled),
      DOJI_ADMIN_INDEPENDENT_EMPLOYEE: String(config.independentEmployeeIdentity), DOJI_ADMIN_STAFF_WORKFLOW_ENABLED: String(config.staffWorkflowEnabled),
      DOJI_ADMIN_UNIFIED_SAFETY_ENABLED: 'true', DOJI_ADMIN_EDITORIAL_ENABLED: String(config.editorialEnabled),
      DOJI_ADMIN_BUSINESS_APPLICATIONS_ENABLED: String(config.businessApplicationsEnabled), DOJI_ADMIN_SAFETY_REMOVAL_ENABLED: String(config.safetyRemovalEnabled),
      DOJI_ADMIN_BUSINESS_PRIVACY_ENABLED: String(config.businessPrivacyEnabled), DOJI_ADMIN_CAMPAIGNS_ENABLED: String(config.campaignsEnabled) } });
  const candidateBundle = await readFile(`website/${buildDir}/${bundle}`, 'utf8');
  const newConfig = candidateBundle.match(configPattern); assert.ok(newConfig?.[1]);
  assert.deepEqual(JSON.parse(newConfig[1]), { ...config, unifiedSafetyEnabled: true });
  let expected = oldBundle.replace(match[0], () => newConfig[0]);
  const route = '    "/staff-workflow/inbox": "get_admin_staff_work_page_v1",';
  assert.equal(expected.split(route).length, 2);
  expected = expected.replace(route, route + '\n    "/staff-workflow/safety": "get_admin_safety_work_page_v1",');
  const controller = await readFile(`${baseline}/portal.js`, 'utf8');
  assert.equal(expected.split(controller).length, 2);
  expected = expected.replace(controller, () => readBrowserSource('portal.js'));
  const help = readBrowserSource('admin-portal/contextual-help.js'), end = readBrowserSource('portal-select.js');
  const block = (s: string) => { assert.equal(s.split(help).length, 2); assert.equal(s.split(end).length, 2); return s.slice(s.indexOf(help) + help.length, s.indexOf(end)); };
  expected = expected.replace(block(expected), () => block(candidateBundle));
  assert.equal(hash(candidateBundle), hash(expected), 'Unexpected identity/transport/other bundled change');
  await cp(baseline, output, { recursive: true, force: false, errorOnExist: true });
  for (const path of paths) await cp(`website/${buildDir}/${path}`, `${output}/${path}`);
  const assets = await inventory(output), oldAssets = evidenceAssets(manifest.assets);
  const changed = assets.filter(a => oldAssets.find(b => b.path === a.path)?.sha256 !== a.sha256).map(a => a.path);
  assert.deepEqual([...changed].sort(), [...paths].sort());
  assert.deepEqual(assets.map(a => a.path), oldAssets.map(a => a.path));
  await save('prepared', { at: new Date().toISOString(), pages: currentPages, functions: fs, secrets: secrets(),
    configHashes: await configHashes(), database: db, assets, changed, edge, rollback: { site: baseline, edge: `${root}/edge-before`, sql: 'docs/drafts/staff_safety_queue_v1.rollback.sql' },
    sqlHash: hash(await readFile('docs/drafts/staff_safety_queue_v1.sql')) });
  console.log(JSON.stringify({ changed, runtimeChanged: runtime, productionUnchanged: true }));
} else if (mode === 'test') {
  const p = await read(`${root}/prepared.json`);
  assert.deepEqual(await inventory(`${root}/edge-after`), p.edge);
  const out = `${root}/artifact-tests`; await mkdir(out, { recursive: true });
  const names = ['test-employee-workflow-adapter', 'test-employee-application-adapter', 'test-restricted-portal-sql', 'test-employee-runtime-boundaries', 'test-employee-resources'];
  const files: string[] = [];
  for (const name of names) {
    let source = ts.transpileModule(await readFile(`scripts/${name}.mts`, 'utf8'), { fileName: `${name}.mts`, compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    for (const m of [...source.matchAll(/from ['"](\.[^'"]+)['"]/g)]) {
      const spec = m[1]; assert.ok(spec);
      const deployed = resolve(`${root}/edge-after/supabase/functions/${slug}/runtime/${basename(spec).replace(/\.mts$/, '.mjs')}`);
      const exists = await access(deployed).then(() => true, () => false);
      source = source.replaceAll(spec, pathToFileURL(exists && spec.startsWith('../infra/portal-identity-candidate/') ? deployed : resolve('scripts', spec)).href);
    }
    const path = `${out}/${name}.mjs`; await writeFile(path, source); files.push(path);
  }
  execFileSync(process.execPath, ['--test', ...files], { stdio: 'inherit', timeout: 60000 });
  await save('runtime-tested', { at: new Date().toISOString(), edge: p.edge });
} else if (mode === 'browser-test') {
  const p = await read(`${root}/prepared.json`);
  assert.deepEqual(await inventory(output), p.assets);
  execFileSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config',
    'website/admin-portal/playwright.workflow.config.mts', '--grep', 'built unified safety|unified safety|safety queue'],
  { stdio: 'inherit', timeout: 60000, env: { ...process.env, DOJI_WORKFLOW_RELEASE_DIR: output } });
  await save('browser-tested', { at: new Date().toISOString(), assets: p.assets });
} else if (mode === 'database') {
  const p = await guard(14), db = evidenceRecord(p.database), expected = String(db.hash);
  await read(`${root}/runtime-tested.json`);
  const source = await readFile('docs/drafts/staff_safety_queue_v1.sql', 'utf8');
  assert.equal(hash(source), p.sqlHash);
  assert.match(expected, /^[a-f0-9]{32}$/);
  const original = String(db.bridge).replaceAll("'", "''");
  const settings = JSON.stringify(db.settings).replaceAll("'", "''");
  const sql = `begin;set local lock_timeout='2s';set local statement_timeout='8s';
    do $$begin if not pg_try_advisory_xact_lock(hashtextextended('doji-staff-workflow-v1',0)) then raise exception 'Concurrent release';end if;
    ${windowGuard}
    if (${fingerprint})<>'${expected}' or pg_get_functiondef('${bridge}'::regprocedure)<>'${original}' then raise exception 'Contract drift';end if;
    if (select to_jsonb(s) from staff_workflow_private.settings s)<>'${settings}'::jsonb then raise exception 'Settings drift';end if;
    if to_regprocedure('${oldBridge}') is not null or to_regprocedure('${readSignature}') is not null then raise exception 'Already installed';end if;end$$;
    ${body(source)}
    do $$begin if (${fingerprint})<>'${expected}' then raise exception 'Member/portal contracts changed';end if;
    if (select safety_queue_enabled from staff_workflow_private.settings where singleton) then raise exception 'Must remain disabled';end if;
    if replace(pg_get_functiondef('${oldBridge}'::regprocedure),'employee_workflow_before_safety_v1','employee_workflow_rpc_v1')<>'${original}' then raise exception 'Delegation drift';end if;end$$;commit;`;
  await save('database-started', { at: new Date().toISOString(), sqlHash: hash(sql) });
  query(sql);
  await save('database-installed', { at: new Date().toISOString(), gate: false, contractHash: expected });
  console.log('Employee safety read installed disabled; all pinned contracts preserved.');
} else if (mode === 'edge' || mode === 'edge-verify') {
  await read(`${root}/database-installed.json`);
  if (mode === 'edge') {
    await guard(14);
    await save('edge-started', { at: new Date().toISOString(), priorVersion: 14 });
    cli(['functions', 'deploy', slug, '--project-ref', ref, '--use-api', '--workdir', `${root}/edge-after`], false);
  }
  await guard(15);
  cli(['functions', 'download', slug, '--project-ref', ref, '--use-api', '--workdir', `${root}/edge-verified`], false);
  assert.deepEqual(await inventory(`${root}/edge-verified/supabase/functions`), await inventory(`${root}/edge-after/supabase/functions`));
  await save('edge-verified', { at: new Date().toISOString(), version: 15 });
  console.log('Exact employee runtime v15 verified; all other Edge functions unchanged.');
} else if (mode === 'enable') {
  const p = await guard(15), db = evidenceRecord(p.database);
  await read(`${root}/edge-verified.json`);
  const original = JSON.stringify(db.settings).replaceAll("'", "''");
  await save('enable-started', { at: new Date().toISOString() });
  query(`begin;set local lock_timeout='2s';set local statement_timeout='8s';do $$declare n integer;begin
    if not pg_try_advisory_xact_lock(hashtextextended('doji-staff-workflow-v1',0)) then raise exception 'Concurrent release';end if;
    ${windowGuard}
    if (${fingerprint})<>'${String(db.hash)}' then raise exception 'Contract drift';end if;
    update staff_workflow_private.settings s set safety_queue_enabled=true where singleton and not safety_queue_enabled and (to_jsonb(s)-'safety_queue_enabled')='${original}'::jsonb;
    get diagnostics n=row_count;if n<>1 then raise exception 'Gate/settings conflict';end if;end$$;commit;`);
  await save('enabled', { at: new Date().toISOString(), gate: true });
  console.log('Only the additive employee safety read gate enabled.');
} else if (mode === 'site') {
  await read(`${root}/enabled.json`);
  await read(`${root}/browser-tested.json`);
  await guard(15);
  await save('site-started', { at: new Date().toISOString() });
  try {
    execFileSync(process.execPath, ['infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js', 'pages', 'deploy', output,
      '--project-name', 'doji-admin', '--branch', 'main', '--commit-dirty=true', '--commit-message', 'Unified safety review and personal work queue'],
    { stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000, env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account } });
  } catch { throw Error('Unknown deployment outcome; inspect, never blindly retry.'); }
  await save('site-deployed', { at: new Date().toISOString(), pages: await pages() });
  console.log('Admin UI deployed; live verification remains.');
} else if (mode === 'verify') {
  const p = await guard(15, true), actual = await pages();
  assert.deepEqual(actual, (await read(`${root}/site-deployed.json`)).pages);
  assert.notDeepEqual(actual['doji-admin'], evidenceRecord(p.pages)['doji-admin']);
  for (const path of paths) {
    const r = await fetch(`https://admin.dojipro.com/${path}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    assert.equal(r.status, 200);
    assert.equal(hash(Buffer.from(await r.arrayBuffer())), evidenceAssets(p.assets).find(a => a.path === path)?.sha256, path);
  }
  for (const [origin, expected] of [['https://admin.dojipro.com', 401], ['https://business.dojipro.com', 403]] as const) {
    const r = await fetch('https://admin.dojipro.com/api/session', { headers: { origin }, signal: AbortSignal.timeout(15000) });
    await r.body?.cancel(); assert.equal(r.status, expected);
  }
  const enabled = query('begin read only;select safety_queue_enabled from staff_workflow_private.settings where singleton;rollback;')[0]?.safety_queue_enabled;
  assert.equal(enabled, true);
  await save('verified', { at: new Date().toISOString(), pages: actual, employeeVersion: 15, assets: paths,
    unaffectedContractsPreserved: true, secretsAndOtherDeploymentsPreserved: true });
  console.log('Live assets, employee version, database fingerprint and session boundaries verified.');
}
