// Business runtime only. Retains current exact-alias window, config and provider gates.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cli, ref, hash, inventory } from './prepare-safety-launch.mts';
import { functions, secrets, pages, database, health } from './business-disabled-release-reads.mts';
import { evidenceRecord, evidenceArray, evidenceRows } from './release-evidence.mts';
const root = 'test-results/business-buffer-fix-20261011';
const candidate = 'test-results/business-owned-candidate-5IQNY1';
const previous = 'test-results/business-owned-candidate-AH5Z8a';
const slug = 'business-portal-v2';
const mode = process.argv[2];
assert.ok(['prepare', 'deploy', 'verify'].includes(mode || ''));
const read = async (path: string) => evidenceRecord(JSON.parse(await readFile(path, 'utf8')));
const save = (name: string, value: unknown) =>
  writeFile(`${root}/${name}.json`, JSON.stringify(value, null, 2), { flag: 'wx' });
const manifest = await read(`${candidate}/manifest.json`);
const oldManifest = await read(`${previous}/manifest.json`);
const allowed = [
  'business-owned-guard.mts',
  'business-owned-runtime.mts',
  'business-owned-reset.mts',
  'business-owned-reset-events.mts',
  'business-owned-http.mts',
  'business-owned-diagnostics.mts',
];
const changes: string[] = [];
for (const [path, value] of Object.entries(evidenceRecord(manifest.files))) {
  assert.ok(/^[A-Za-z0-9_./-]+$/.test(path) && !path.split('/').includes('..'));
  assert.equal(hash(await readFile(`${candidate}/${path}`)), value, path);
  if (path.startsWith('edge/') && value !== evidenceRecord(oldManifest.files)[path]) {
    assert.ok(allowed.includes(path.split('/').at(-1)!), path);
    changes.push(path);
  }
}
assert.equal(changes.length, 6);
function gates() {
  return evidenceRecord(
    evidenceRows(
      cli([
        'db',
        'query',
        `begin read only;set local statement_timeout='3s';
    select jsonb_build_object('acceptance',(select to_jsonb(s) from business_session_private.owned_auth_acceptance s where singleton),
    'mail',(select to_jsonb(s) from business_session_private.owned_auth_mail_settings s where singleton),
    'settings',(select to_jsonb(s) from business_session_private.settings s where singleton),
    'enrollment',(select to_jsonb(s) from portal_identity_private.business_enrollment_settings s where singleton)) state;rollback;`,
        '--linked',
        '--workdir',
        'D:/ChallengeApp/DoIt',
        '--output-format',
        'json',
      ]),
    )[0]?.state,
  );
}
async function verifyFiles(folder: string, source: string) {
  const files = await inventory(folder);
  const expected = await read(`${source}/manifest.json`);
  let checked = 0;
  for (const path of Object.keys(evidenceRecord(expected.files)).filter((p) =>
    p.startsWith('edge/supabase/functions/'),
  )) {
    const matches = files.filter((f) => f.path.endsWith('/' + path.split('/').at(-1)));
    assert.equal(matches.length, 1, path);
    assert.equal(
      hash((await readFile(`${folder}/${matches[0]!.path}`, 'utf8')).replaceAll('\r\n', '\n')),
      hash((await readFile(`${source}/${path}`, 'utf8')).replaceAll('\r\n', '\n')),
      path,
    );
    checked++;
  }
  assert.equal(checked, Number(expected.runtimeFiles) + 2);
  return checked;
}
async function boundaries(deployed: boolean) {
  const before = await read(`${root}/baseline.json`);
  const db = database(),
    oldDb = evidenceRecord(before.database);
  assert.equal(db.event_window, false);
  assert.equal(db.overdue_sample, 0);
  for (const key of ['contracts', 'policies', 'roles']) assert.equal(db[key], oldDb[key]);
  assert.deepEqual(await pages(), before.pages);
  const fns = functions(),
    oldFns = evidenceArray(before.functions);
  assert.equal(fns.length, oldFns.length);
  for (const old of oldFns) {
    const current = fns.find((f) => f.id === old.id);
    assert.ok(current);
    if (deployed && old.slug === slug) {
      assert.equal(current.version, Number(old.version) + 1);
      assert.equal(current.status, 'ACTIVE');
      assert.equal(current.verify_jwt, old.verify_jwt);
    } else assert.deepEqual(current, old);
  }
  const currentSecrets = secrets(),
    oldSecrets = evidenceArray(before.secrets);
  assert.equal(currentSecrets.length, oldSecrets.length);
  for (const old of oldSecrets) {
    const current = currentSecrets.find((s) => s.name === old.name);
    assert.ok(current);
    assert.equal(current.value, old.value);
  }
  const currentGates = gates();
  assert.equal(hash(JSON.stringify(currentGates)), before.gatesHash);
  const acceptance = evidenceRecord(currentGates.acceptance);
  assert.equal(acceptance.enabled, true);
  assert.equal(acceptance.reserved_at, null);
  assert.ok(Date.parse(String(acceptance.expires_at)) - Date.now() > 300000);
}
if (mode === 'prepare') {
  await assert.rejects(access(`${root}/baseline.json`), 'Baseline already captured');
  await mkdir(root, { recursive: true });
  const db = database();
  assert.equal(db.event_window, false);
  assert.equal(db.overdue_sample, 0);
  const gate = gates();
  assert.equal(evidenceRecord(gate.acceptance).reserved_at, null);
  await save('baseline', {
    at: new Date().toISOString(),
    database: db,
    functions: functions(),
    secrets: secrets(),
    pages: await pages(),
    gatesHash: hash(JSON.stringify(gate)),
  });
  await mkdir(`${root}/before`);
  cli(
    [
      'functions',
      'download',
      slug,
      '--project-ref',
      ref,
      '--use-api',
      '--workdir',
      resolve(root, 'before'),
    ],
    false,
  );
  await verifyFiles(`${root}/before`, previous);
  await save('prepared', {
    candidate,
    changes,
    rollback: await inventory(`${root}/before`),
    until: evidenceRecord(gate.acceptance).expires_at,
  });
  console.log('Fresh business-only baseline and exact rollback package verified.');
} else {
  const prepared = await read(`${root}/prepared.json`);
  assert.deepEqual(await inventory(`${root}/before`), prepared.rollback);
  if (mode === 'deploy') {
    await boundaries(false);
    await assert.rejects(
      access(`${root}/deploy-started.json`),
      'Inspect prior deployment; do not retry',
    );
    await writeFile(
      `${candidate}/edge/supabase/config.toml`,
      `project_id="business-buffer-fix"\n[functions.${slug}]\nverify_jwt=false\nimport_map="./functions/${slug}/deno.json"\n`,
      { flag: 'wx' },
    );
    await save('deploy-started', { at: new Date().toISOString(), candidate, changes });
    cli(
      [
        'functions',
        'deploy',
        slug,
        '--project-ref',
        ref,
        '--use-api',
        '--workdir',
        resolve(candidate, 'edge'),
      ],
      false,
    );
  }
  await boundaries(true);
  const downloaded = `${root}/after-${Date.now()}`;
  await mkdir(downloaded);
  cli(
    [
      'functions',
      'download',
      slug,
      '--project-ref',
      ref,
      '--use-api',
      '--workdir',
      resolve(downloaded),
    ],
    false,
  );
  const count = await verifyFiles(downloaded, candidate);
  const r = await fetch('https://business.dojipro.com/auth/owned/bootstrap', {
    headers: { origin: 'https://business.dojipro.com' },
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(r.status, 200);
  await r.body?.cancel();
  await save(`verified-${Date.now()}`, {
    at: new Date().toISOString(),
    sourceFiles: count,
    health: await health(),
    otherFunctionsUnchanged: true,
    secretsUnchanged: true,
    databaseContractsUnchanged: true,
    acceptanceUnchanged: true,
  });
  console.log(
    JSON.stringify({
      businessRuntimeDeployed: true,
      sourceFiles: count,
      unrelatedSystemsUnchanged: true,
      providerCalls: 0,
    }),
  );
}
