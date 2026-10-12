// Code-only business runtime upgrade. Owned mode remains off, current secrets
// and provider settings remain unchanged. No emails or account commands.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cli, ref, hash, inventory } from './prepare-safety-launch.mts';
import { functions, secrets, pages, database, health } from './business-disabled-release-reads.mts';
import { evidenceArray, evidenceRecord } from './release-evidence.mts';
const [release, candidate, mode] = process.argv.slice(2);
assert.ok(release && /^test-results\/business-owned-release-[A-Za-z0-9]+$/.test(release));
assert.ok(candidate && /^test-results\/business-owned-candidate-[A-Za-z0-9]+$/.test(candidate));
assert.ok(mode && ['deploy', 'verify'].includes(mode));
const read = async (folder: string, file: string) =>
  evidenceRecord(JSON.parse(await readFile(`${folder}/${file}.json`, 'utf8')));
const before = await read(release, 'baseline');
const manifest = await read(candidate, 'manifest');
assert.ok((await readdir(release)).some((f) => f.startsWith('verified-')));
for (const [path, expected] of Object.entries(evidenceRecord(manifest.files))) {
  assert.match(path, /^[a-zA-Z0-9_./-]+$/);
  assert.ok(!path.startsWith('/') && !path.split('/').includes('..'));
  assert.equal(hash(await readFile(`${candidate}/${path}`)), expected);
}
const slug = 'business-portal-v2';
async function boundaries(deployed: boolean) {
  // A function deployment refreshes timestamps of platform-managed secrets.
  // Values and membership must match; custom-secret timestamps stay exact too.
  const priorSecrets = evidenceArray(before.secrets);
  const currentSecrets = secrets();
  assert.equal(currentSecrets.length, priorSecrets.length);
  for (const old of priorSecrets) {
    const current = currentSecrets.find((s) => s.name === old.name);
    assert.ok(current);
    assert.deepEqual(
      deployed && String(old.name).startsWith('SUPABASE_')
        ? { ...current, updated_at: old.updated_at }
        : current,
      old,
    );
  }
  assert.deepEqual(await pages(), before.pages);
  const current = functions(),
    oldFunctions = evidenceArray(before.functions);
  assert.equal(current.length, oldFunctions.length);
  for (const old of oldFunctions) {
    const next = current.find((f) => f.id === old.id);
    assert.ok(next);
    if (old.slug === slug && deployed) {
      assert.equal(next.version, Number(old.version) + 1);
      assert.equal(next.verify_jwt, old.verify_jwt);
      assert.equal(next.status, 'ACTIVE');
    } else assert.deepEqual(next, old);
  }
  const db = database(),
    oldDb = evidenceRecord(before.database);
  assert.equal(db.event_window, false);
  assert.equal(db.overdue_sample, 0);
  for (const key of ['contracts', 'policies', 'roles']) assert.equal(db[key], oldDb[key]);
  assert.ok(!secrets().some((s) => s.name === 'BUSINESS_OWNED_AUTH_ENABLED'));
}
const save = (name: string, data: unknown) =>
  writeFile(`${release}/${name}.json`, JSON.stringify(data, null, 2), { flag: 'wx' });
if (mode === 'deploy') {
  await boundaries(false);
  await assert.rejects(
    access(`${release}/runtime-deploy-started.json`),
    'Inspect previous attempt; do not retry',
  );
  await writeFile(
    `${candidate}/edge/supabase/config.toml`,
    `project_id="business-owned-disabled"\n[functions.${slug}]\nverify_jwt=false\nimport_map="./functions/${slug}/deno.json"\n`,
    { flag: 'wx' },
  );
  await save('runtime-deploy-started', {
    at: new Date().toISOString(),
    candidate,
    files: manifest.files,
  });
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
const downloaded = `${release}/runtime-downloaded-${Date.now()}`;
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
const found = await inventory(downloaded);
let checked = 0;
for (const path of Object.keys(evidenceRecord(manifest.files)).filter(
  (p) => p.startsWith('edge/supabase/functions/') && p.endsWith('.mts'),
)) {
  const match = found.filter((f) => f.path.endsWith('/' + path.split('/').at(-1)));
  assert.equal(match.length, 1, path);
  assert.equal(
    hash((await readFile(`${downloaded}/${match[0]!.path}`, 'utf8')).replaceAll('\r\n', '\n')),
    hash((await readFile(`${candidate}/${path}`, 'utf8')).replaceAll('\r\n', '\n')),
    path,
  );
  checked++;
}
assert.equal(checked, manifest.runtimeFiles);
// Entry and import map are part of the deployed contract too.
for (const name of ['index.ts', 'deno.json']) {
  const actual = `${downloaded}/supabase/functions/${slug}/${name}`;
  const expected: string = `${candidate}/edge/supabase/functions/${slug}/${name}`;
  assert.equal(
    hash((await readFile(actual, 'utf8')).replaceAll('\r\n', '\n')),
    hash((await readFile(expected, 'utf8')).replaceAll('\r\n', '\n')),
    name,
  );
}
const prepared = await read(release, 'prepared');
const config = evidenceRecord(
  JSON.parse(await readFile(`${prepared.secure}/runtime-before.json`, 'utf8')),
);
const checks = [];
for (const [path, status] of [
  ['/api/session', 401],
  ['/auth/owned/bootstrap', 404],
] as const) {
  const response = await fetch(String(config.endpoint) + path, {
    headers: {
      origin: String(config.origin),
      'x-doji-portal-proxy-key': String(config.proxyKey),
      'x-doji-client-ip': '192.0.2.1',
    },
    signal: AbortSignal.timeout(15000),
    redirect: 'manual',
  });
  await response.body?.cancel();
  assert.equal(response.status, status, path);
  checks.push({ path, status });
}
await save(`runtime-verified-${Date.now()}`, {
  at: new Date().toISOString(),
  candidate,
  sourceFiles: checked + 2,
  checks,
  health: await health(),
  ownedModeEnabled: false,
  providerCalls: 0,
  unrelatedFunctionsUnchanged: true,
});
console.log(
  JSON.stringify({
    runtimeDeployed: true,
    sourceFilesVerified: checked + 2,
    ownedModeEnabled: false,
    currentLoginPreserved: true,
    providerCalls: 0,
  }),
);
