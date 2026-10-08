// Owner-approved disabled installation only. No credentials, SQL writes or cutover.
import assert from 'node:assert/strict';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { posix } from 'node:path';
import { runtimeSourceClosure } from './business-runtime-source-closure.mts';
import { cli, ref, hash, inventory } from './prepare-safety-launch.mts';
import { evidenceArray, evidenceRecord, evidenceNumber } from './release-evidence.mts';
import {
  functions,
  secrets,
  pages,
  database,
  health,
  linkedWorkspace,
} from './business-disabled-release-reads.mts';

const root = 'test-results/business-independent-disabled-20261005';
const slug = 'business-portal-v2';
const mode = process.argv[2];
assert.ok(mode && ['prepare', 'configure', 'verify-configure', 'deploy', 'verify'].includes(mode));
const save = (name: string, value: unknown) =>
  writeFile(`${root}/${name}.json`, JSON.stringify(value, null, 2), { flag: 'wx' });
const read = async (name: string) =>
  evidenceRecord(JSON.parse(await readFile(`${root}/${name}.json`, 'utf8')));
async function unchanged(before: Record<string, unknown>, configured: boolean) {
  const current = functions();
  for (const old of evidenceArray(before.functions)) {
    const now = current.find((f) => f.id === old.id);
    assert.ok(now, `Missing existing function ${old.slug}`);
    assert.deepEqual(
      { ...now, version: old.version },
      old,
      `Existing function changed: ${old.slug}`,
    );
    assert.equal(now.version, evidenceNumber(old.version) + (configured ? 1 : 0));
  }
  assert.equal(
    current.filter((f) => f.slug !== slug).length,
    evidenceArray(before.functions).length,
  );
  const now = secrets();
  for (const old of evidenceArray(before.secrets)) {
    const current = now.find((s) => s.name === old.name);
    assert.ok(current, `Missing existing secret: ${old.name}`);
    // Deploying a new function refreshes system-secret timestamps, not values.
    assert.deepEqual(
      { ...current, updated_at: old.updated_at },
      old,
      `Existing secret digest/contract changed: ${old.name}`,
    );
  }
  const added = now.filter(
    (s) => !evidenceArray(before.secrets).some((old) => old.name === s.name),
  );
  assert.equal(added.length, configured ? 1 : 0);
  if (configured) {
    assert.equal(added[0]?.name, 'BUSINESS_V2_ENABLED');
    // This CLI exposes the SHA-256 digest as `value`, never as plaintext.
    assert.equal(added[0]?.value, hash('false'));
  }
  assert.deepEqual(await pages(), before.pages);
  const db = database(),
    original = evidenceRecord(before.database);
  assert.equal(db.event_window, false, 'Event window: stop release');
  for (const key of ['contracts', 'policies', 'roles']) assert.equal(db[key], original[key], key);
  assert.equal(db.overdue_sample, 0, 'Overdue outbox work: stop release');
  return db;
}
assert.equal((await readFile(`${linkedWorkspace}/supabase/.temp/project-ref`, 'utf8')).trim(), ref);
await mkdir(root, { recursive: true });
if (mode === 'prepare') {
  await assert.rejects(
    access(`${root}/baseline.json`),
    'Inspect existing preparation, never replace',
  );
  const before = {
    at: new Date().toISOString(),
    functions: functions(),
    secrets: secrets(),
    pages: await pages(),
    database: database(),
    health: await health(),
  };
  assert.ok(!before.functions.some((f) => f.slug === slug));
  assert.ok(!before.secrets.some((s) => String(s.name).startsWith('BUSINESS_V2_')));
  assert.equal(before.database.event_window, false);
  assert.equal(before.database.overdue_sample, 0);
  // Package only the imported closure, with no dependency on paths outside function extraction.
  const pending = ['business-runtime.mts'],
    required = new Set<string>();
  const base = `${root}/edge/supabase/functions/${slug}`;
  await mkdir(`${base}/runtime`, { recursive: true });
  while (pending.length) {
    const file = pending.pop();
    assert.ok(file);
    if (required.has(file)) continue;
    assert.ok(/^[a-z0-9-]+\.mts$/.test(file), 'Unexpected runtime dependency path');
    required.add(file);
    const source = await readFile(`infra/portal-identity-candidate/${file}`, 'utf8');
    for (const match of source.matchAll(/(?:from\s+|import\s*)['"](\.[^'"]+)['"]/g)) {
      assert.ok(match[1]);
      pending.push(posix.normalize(posix.join(posix.dirname(file), match[1])));
    }
    await writeFile(`${base}/runtime/${file}`, source, { flag: 'wx' });
  }
  const entry = await readFile(`supabase/functions/${slug}/index.ts`, 'utf8');
  assert.equal(entry.split('../../../infra/portal-identity-candidate/').length, 2);
  await writeFile(
    `${base}/index.ts`,
    entry.replace('../../../infra/portal-identity-candidate/', './runtime/'),
    { flag: 'wx' },
  );
  await writeFile(`${base}/deno.json`, await readFile(`supabase/functions/${slug}/deno.json`), {
    flag: 'wx',
  });
  await writeFile(
    `${root}/edge/supabase/config.toml`,
    `project_id = "business-independent-disabled"\n[functions.${slug}]\nverify_jwt = false\nimport_map = "./functions/${slug}/deno.json"\n`,
    { flag: 'wx' },
  );
  await save('baseline', before);
  await save('candidate', {
    assets: await inventory(`${root}/edge`),
    enabled: false,
    runtimeCredentialsInstalled: false,
    sourceCount: required.size + 1,
  });
  console.log(
    JSON.stringify({
      prepared: true,
      existingFunctions: before.functions.length,
      eventWindow: false,
      nextEvent: before.database.next_event,
      overdue: before.database.overdue_sample,
      health: before.health,
    }),
  );
} else {
  const before = await read('baseline'),
    candidate = await read('candidate');
  assert.deepEqual(
    (await inventory(`${root}/edge`)).filter((f) => !f.path.includes('/.temp/')),
    candidate.assets,
  );
  if (mode === 'configure' || mode === 'verify-configure') {
    if (mode === 'configure') {
      await unchanged(before, false);
      await save('configure-started', { at: new Date().toISOString() });
      cli(['secrets', 'set', 'BUSINESS_V2_ENABLED=false', '--project-ref', ref], false);
    } else await read('configure-started');
    const db = await unchanged(before, true);
    await save('configured', {
      at: new Date().toISOString(),
      database: db,
      health: await health(),
      enabled: false,
    });
    console.log(
      'Only BUSINESS_V2_ENABLED=false added; previous secret digests, function sources and Pages preserved.',
    );
  } else {
    await read('configured');
    await unchanged(before, true);
    if (mode === 'deploy') {
      assert.ok(
        !functions().some((f) => f.slug === slug),
        'Endpoint now exists: inspect instead of replacing',
      );
      await save('deploy-started', { at: new Date().toISOString() });
      cli(
        [
          'functions',
          'deploy',
          slug,
          '--project-ref',
          ref,
          '--use-api',
          '--workdir',
          `${root}/edge`,
        ],
        false,
      );
    }
    const deployed = functions().find((f) => f.slug === slug);
    assert.ok(deployed && deployed.status === 'ACTIVE' && deployed.verify_jwt === false);
    const checks = [];
    for (const path of ['/api/session', '/auth/start', '/auth/workos-registration']) {
      const r = await fetch(`https://${ref}.supabase.co/functions/v1/${slug}${path}`, {
        method: path.startsWith('/auth/') ? 'POST' : 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      assert.equal(r.status, 503);
      assert.equal(r.headers.get('cache-control'), 'no-store');
      assert.equal(await r.text(), '');
      checks.push({ path, status: r.status });
    }
    const folder = `${root}/download-${Date.now()}`;
    await mkdir(folder, { recursive: true });
    cli(
      ['functions', 'download', slug, '--project-ref', ref, '--use-api', '--workdir', folder],
      false,
    );
    const files = await inventory(folder);
    const required = await runtimeSourceClosure(
      `${root}/edge`,
      `supabase/functions/${slug}/index.ts`,
    );
    for (const source of evidenceArray(candidate.assets)) {
      const path = String(source.path);
      if (!required.has(path)) continue;
      const found = files.filter((f) => f.path.endsWith('/' + path.split('/').at(-1)));
      assert.equal(found.length, 1, `Downloaded source missing/ambiguous: ${path}`);
      const normalize = async (f: string) =>
        hash((await readFile(f, 'utf8')).replaceAll('\r\n', '\n'));
      assert.equal(
        await normalize(`${folder}/${found[0]?.path}`),
        await normalize(`${root}/edge/${path}`),
      );
    }
    const db = await unchanged(before, true);
    await save(`verified-${Date.now()}`, {
      at: new Date().toISOString(),
      deployed,
      checks,
      database: db,
      health: await health(),
      sourceVerified: true,
      disabled: true,
      credentialsInstalled: false,
      existingFunctionsAndSecretsPreserved: true,
      pagesUnchanged: true,
    });
    console.log(
      'Business endpoint source-verified DISABLED. Existing function sources, secrets, database contracts and Pages preserved.',
    );
  }
}
