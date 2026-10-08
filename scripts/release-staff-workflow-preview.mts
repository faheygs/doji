// Only the owner-approved gated employee preview. No root promotion, member writes or secret changes.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { cli, cf, ref, account, hash, inventory } from './prepare-safety-launch.mts';
import { functions, secrets, pages, linkedWorkspace } from './business-disabled-release-reads.mts';
import {
  evidenceRecord,
  evidenceRows,
  evidenceArray,
  evidenceAssets,
} from './release-evidence.mts';
import {
  contractHash,
  indexNames,
  indexStatements,
  windowGuard,
  assertSecretDigestsUnchanged,
} from './staff-workflow-release-guards.mts';
const root = 'test-results/staff-workflow-release',
  slug = 'employee-portal-v2';
const mode = process.argv[2];
assert.ok(
  mode && ['database', 'index', 'edge', 'verify-edge', 'preview', 'enable-database'].includes(mode),
);
assert.equal(process.argv[mode === 'index' ? 4 : 3], '--approved-preview');
const read = async (name: string) =>
  evidenceRecord(JSON.parse(await readFile(`${root}/${name}.json`, 'utf8')));
const save = (name: string, v: unknown) =>
  writeFile(`${root}/${name}.json`, JSON.stringify(v, null, 2), { flag: 'wx' });
const c = await read('candidate'),
  a = await read('artifacts');
const query = (sql: string) =>
  evidenceRows(
    cli(['db', 'query', sql, '--linked', '--workdir', linkedWorkspace, '--output-format', 'json']),
  );
const runFile = (name: string) =>
  cli([
    'db',
    'query',
    '--file',
    resolve(`${root}/${name}.sql`),
    '--linked',
    '--workdir',
    linkedWorkspace,
    '--output-format',
    'json',
  ]);
assert.equal((await readFile(`${linkedWorkspace}/supabase/.temp/project-ref`, 'utf8')).trim(), ref);
async function infrastructure(edgeChanged = false, previewChanged = false) {
  const current = functions();
  for (const old of evidenceArray(c.functions)) {
    const next = current.find((f) => f.id === old.id);
    assert.ok(next);
    if (old.slug === slug && edgeChanged) assert.equal(next.version, Number(old.version) + 1);
    else assert.deepEqual(next, old, 'Unrelated function changed');
  }
  assert.equal(current.length, evidenceArray(c.functions).length);
  assertSecretDigestsUnchanged(secrets(), evidenceArray(c.secrets));
  const p = await pages();
  for (const name of ['doji-admin', 'doji-business', 'doji-site']) {
    if (name === 'doji-admin' && previewChanged)
      assert.notEqual(evidenceRecord(p[name]).id, evidenceRecord(evidenceRecord(c.pages)[name]).id);
    else assert.deepEqual(p[name], evidenceRecord(c.pages)[name], `Deployment drift ${name}`);
    const project = evidenceRecord(await cf(`/pages/projects/${name}`));
    assert.equal(
      hash(JSON.stringify(project.deployment_configs)),
      evidenceRecord(c.configHashes)[name],
      `Configuration drift ${name}`,
    );
  }
  return p;
}
function databaseState() {
  return evidenceRecord(
    query(`begin read only;set local statement_timeout='8s';select jsonb_build_object(
 'hash',(${contractHash}),'candidate',to_regnamespace('staff_workflow_private') is not null,
 'window',exists(select 1 from public.daily_events where fires_at<=clock_timestamp()+interval '25 minutes' and fires_at+interval '15 minutes'>clock_timestamp() limit 1),
 'overdue',exists(select 1 from public.domain_event_outbox where published_at is null and available_at<clock_timestamp()-interval '60 seconds' limit 1),
 'indexes',(select coalesce(jsonb_agg(jsonb_build_object('name',n,'valid',i.indisvalid,'ready',i.indisready,'definition',pg_get_indexdef(i.indexrelid)) order by n),'[]') from unnest(array['${indexNames.join("','")}']) n join pg_index i on i.indexrelid=to_regclass(n))) state;rollback;`)[0]
      ?.state,
  );
}
function checkState(state: Record<string, unknown>) {
  assert.equal(state.hash, evidenceRecord(c.before).hash, 'Shared contract drift');
  assert.equal(state.window, false);
  assert.equal(state.overdue, false);
}
for (const f of evidenceAssets(c.files)) assert.equal(hash(await readFile(f.path)), f.sha256);
assert.equal(hash(await readFile(`${root}/install-disabled.sql`)), c.installHash);
assert.equal(hash(await readFile(`${root}/rollback-retain.sql`)), c.rollbackHash);
assert.deepEqual(await inventory(`${root}/site-after`), a.site);
assert.deepEqual(await inventory(`${root}/edge-after`), a.edge);
if (mode === 'database') {
  await infrastructure();
  const before = databaseState();
  checkState(before);
  assert.equal(before.candidate, false);
  await assert.rejects(access(`${root}/database-started.json`));
  await save('database-started', { at: new Date().toISOString(), installHash: c.installHash });
  runFile('install-disabled');
  const after = databaseState();
  checkState(after);
  assert.equal(after.candidate, true);
  const gates = query(
    'select enabled,extended_enabled,events_enabled from staff_workflow_private.settings where singleton;',
  )[0];
  assert.deepEqual(gates, { enabled: false, extended_enabled: false, events_enabled: false });
  await infrastructure();
  await save('database-verified', { at: new Date().toISOString(), after, gates });
} else if (mode === 'index') {
  await read('database-verified');
  await infrastructure();
  const i = Number(process.argv[3]);
  assert.ok(Number.isInteger(i) && i >= 0 && i < 4);
  const before = databaseState();
  checkState(before);
  assert.equal(evidenceArray(before.indexes).length, i);
  for (const index of evidenceArray(before.indexes)) {
    assert.equal(index.valid, true);
    assert.equal(index.ready, true);
  }
  const safety =
    query(`select current_setting('statement_timeout') statement_timeout,current_setting('lock_timeout') lock_timeout,
 (select count(*) from pg_stat_activity where backend_type='client backend' and xact_start<clock_timestamp()-interval '30 seconds') old_transactions,
 (select count(*) from pg_stat_progress_create_index) index_builds,
 (select count(*) from pg_stat_activity where backend_type='client backend' and wait_event_type='Lock') lock_waits,
 greatest(pg_total_relation_size('business_private.applications'),pg_total_relation_size('business_private.privacy_cases'),pg_total_relation_size('public.safety_removal_cases')) max_relation_bytes;`)[0];
  assert.ok(safety);
  assert.equal(safety.statement_timeout, '2min');
  assert.equal(safety.old_transactions, 0);
  assert.equal(safety.index_builds, 0);
  assert.equal(safety.lock_waits, 0);
  assert.ok(Number(safety.max_relation_bytes) < 1e6);
  assert.equal((await readFile(`${root}/index-${i}.sql`, 'utf8')).trim(), indexStatements[i]);
  await save(`index-${i}-started`, { at: new Date().toISOString(), safety, index: indexNames[i] });
  // One statement, no transaction wrapper or retry. Existing two-minute server
  // deadline also bounds lock waits. CLI uncertainty stops release for inspection.
  runFile(`index-${i}`);
  const after = databaseState();
  checkState(after);
  assert.equal(evidenceArray(after.indexes).length, i + 1);
  for (const index of evidenceArray(after.indexes)) {
    assert.equal(index.valid, true);
    assert.equal(index.ready, true);
  }
  await save(`index-${i}-verified`, { at: new Date().toISOString(), indexes: after.indexes });
} else if (mode === 'edge' || mode === 'verify-edge') {
  await read('index-3-verified');
  await infrastructure(mode === 'verify-edge');
  checkState(databaseState());
  if (mode === 'edge') {
    await save('edge-started', { at: new Date().toISOString(), rollbackVersion: 11 });
    cli(
      [
        'functions',
        'deploy',
        slug,
        '--project-ref',
        ref,
        '--use-api',
        '--workdir',
        `${root}/edge-after`,
      ],
      false,
    );
  } else await read('edge-started');
  await infrastructure(true);
  await mkdir(`${root}/edge-verified`, { recursive: true });
  cli(
    [
      'functions',
      'download',
      slug,
      '--project-ref',
      ref,
      '--use-api',
      '--workdir',
      `${root}/edge-verified`,
    ],
    false,
  );
  const actual = await inventory(`${root}/edge-verified`);
  for (const f of evidenceAssets(a.edge).filter((f) => f.path.startsWith('supabase/functions/')))
    assert.equal(
      actual.find((v) => v.path === f.path)?.sha256,
      f.sha256,
      'Deployed source mismatch',
    );
  await save('edge-verified', { at: new Date().toISOString(), version: 12, gate: false });
} else if (mode === 'preview') {
  await read('edge-verified');
  await infrastructure(true);
  checkState(databaseState());
  await save('preview-started', {
    at: new Date().toISOString(),
    rollback: evidenceRecord(evidenceRecord(c.pages)['doji-admin']).id,
  });
  execFileSync(
    process.execPath,
    [
      'infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js',
      'pages',
      'deploy',
      `${root}/site-after`,
      '--project-name',
      'doji-admin',
      '--branch',
      'main',
      '--commit-dirty=true',
      '--commit-message',
      'Gated six-queue employee preview; existing root unchanged',
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: 180000,
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account },
    },
  );
  const p = await infrastructure(true, true);
  for (const path of [
    'index.html',
    'admin-portal/admin-app-20261002d.js',
    'identity/employee-preview/index.html',
    'identity/employee-preview/admin-portal/admin-app-20261002d.js',
  ]) {
    const r = await fetch('https://admin.dojipro.com/' + path, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(r.status, 200);
    assert.equal(
      hash(Buffer.from(await r.arrayBuffer())),
      evidenceAssets(a.site).find((f) => f.path === path)?.sha256,
      path,
    );
  }
  for (const [origin, status] of [
    ['https://admin.dojipro.com', 401],
    ['https://business.dojipro.com', 403],
  ] as const) {
    const r = await fetch('https://admin.dojipro.com/api/session', {
      headers: { origin },
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(r.status, status);
  }
  await save('preview-verified', {
    at: new Date().toISOString(),
    pages: p,
    rootUnchanged: true,
    gates: false,
  });
} else {
  // Runtime enable requires its own pinned artifact and is intentionally absent
  // here. Never expose a half-enabled review experience.
  throw Error(
    'Enable is gated on exact deployed-preview acceptance and runtime enable preparation',
  );
}
console.log(`${mode}: verified; no root promotion or member changes.`);
