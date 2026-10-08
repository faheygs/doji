// Read-only provider capture and local assembly. There is deliberately no deploy mode.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, cp, access } from 'node:fs/promises';
import { cli, cf, ref, hash, inventory } from './prepare-safety-launch.mts';
import { linkedWorkspace, functions, secrets, pages } from './business-disabled-release-reads.mts';
import { evidenceRecord, evidenceRows, evidenceAssets } from './release-evidence.mts';
import {
  contractHash,
  body,
  withoutBlockingIndex,
  guardedInstall,
  indexStatements,
  indexNames,
} from './staff-workflow-release-guards.mts';
const root = 'test-results/staff-workflow-release';
assert.equal(process.argv.length, 2);
assert.equal((await readFile(`${linkedWorkspace}/supabase/.temp/project-ref`, 'utf8')).trim(), ref);
await mkdir(root, { recursive: true });
await assert.rejects(
  access(`${root}/candidate.json`),
  'Existing candidate must be inspected, not replaced',
);
const query = (sql: string) =>
  evidenceRows(
    cli(['db', 'query', sql, '--linked', '--workdir', linkedWorkspace, '--output-format', 'json']),
  );
const before = evidenceRecord(
  query(`begin read only;set local statement_timeout='8s';select jsonb_build_object(
 'hash',(${contractHash}),'candidate',to_regnamespace('staff_workflow_private') is not null,
 'window',exists(select 1 from public.daily_events where fires_at<=clock_timestamp()+interval '25 minutes' and fires_at+interval '15 minutes'>clock_timestamp() limit 1),
 'overdue',exists(select 1 from public.domain_event_outbox where published_at is null and available_at<clock_timestamp()-interval '60 seconds' limit 1),
 'index_exists',exists(select 1 from unnest(array['${indexNames.join("','")}']) n where to_regclass(n) is not null)) state;rollback;`)[0]
    ?.state,
);
assert.equal(before.candidate, false);
assert.equal(before.window, false);
assert.equal(before.overdue, false);
assert.equal(before.index_exists, false);
const deployments = await pages(),
  fs = functions();
assert.equal(evidenceRecord(deployments['doji-admin']).id, 'a4ee3e2f-80b6-4dc7-b894-9494d6303822');
assert.equal(fs.find((f) => f.slug === 'employee-portal-v2')?.version, 11);
const configHashes: Record<string, string> = {};
for (const name of ['doji-admin', 'doji-business', 'doji-site']) {
  const p = evidenceRecord(await cf(`/pages/projects/${name}`));
  configHashes[name] = hash(JSON.stringify(p.deployment_configs));
}
const base = `${linkedWorkspace}/test-results/employee-latency-20261002`;
const prior = evidenceRecord(JSON.parse(await readFile(`${base}/style-candidate.json`, 'utf8')));
assert.deepEqual(
  await inventory(`${base}/site`),
  prior.site,
  'Exact previous admin artifact required',
);
for (const path of [
  'index.html',
  'admin-portal/admin-app-20261002d.js',
  'admin-portal/admin.css',
]) {
  const r = await fetch(`https://admin.dojipro.com/${path}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(r.status, 200);
  assert.equal(
    hash(Buffer.from(await r.arrayBuffer())),
    evidenceAssets(prior.site).find((a) => a.path === path)?.sha256,
  );
}
await cp(`${base}/site`, `${root}/site-before`, {
  recursive: true,
  errorOnExist: true,
  force: false,
});
const names = [
  'staff_case_ownership_v1',
  'staff_workflow_extended_v1',
  'staff_workflow_events_v1',
  'staff_workflow_employee_bridge_v1',
];
const files = [];
const pieces = [];
for (const name of names) {
  const path = `docs/drafts/${name}.sql`,
    source = await readFile(path, 'utf8');
  files.push({ path, sha256: hash(source) });
  pieces.push(
    name === 'staff_case_ownership_v1' ? withoutBlockingIndex(body(source)) : body(source),
  );
}
assert.equal(typeof before.hash, 'string');
const install = guardedInstall(pieces.join('\n'), before.hash as string);
await writeFile(`${root}/install-disabled.sql`, install, { flag: 'wx' });
const rollbacks = [
  'staff_workflow_employee_bridge_v1',
  'staff_workflow_extended_v1',
  'staff_case_ownership_v1',
];
const rollback =
  "begin;set local lock_timeout='2s';set local statement_timeout='8s';\n" +
  (
    await Promise.all(
      rollbacks.map(async (name) =>
        body(await readFile(`docs/drafts/${name}.rollback.sql`, 'utf8')),
      ),
    )
  ).join('\n') +
  '\ncommit;';
await writeFile(`${root}/rollback-retain.sql`, rollback, { flag: 'wx' });
for (const [i, statement] of indexStatements.entries())
  await writeFile(`${root}/index-${i}.sql`, statement + '\n', { flag: 'wx' });
await writeFile(
  `${root}/candidate.json`,
  JSON.stringify(
    {
      at: new Date().toISOString(),
      before,
      files,
      installHash: hash(install),
      rollbackHash: hash(rollback),
      pages: deployments,
      configHashes,
      functions: fs,
      secrets: secrets(),
      baseAssets: prior.site,
      edgeBefore: await inventory(`${root}/edge-before`),
      indexes: indexStatements.map((statement, i) => ({
        name: indexNames[i],
        sha256: hash(statement + '\n'),
      })),
      approvedScope: 'gated_employee_preview',
      deployed: false,
    },
    null,
    2,
  ),
  { flag: 'wx' },
);
console.log(
  'Captured exact live rollback baseline; prepared default-off installation, retaining rollback and four separate concurrent indexes. No deployment performed.',
);
