// Owner-approved acceptance gate only. Root assets/config, credentials and other endpoints stay exact.
import assert from 'node:assert/strict';
import { readFile, writeFile, cp, mkdir, access } from 'node:fs/promises';
import { cli, cf, ref, hash, inventory } from './prepare-safety-launch.mts';
import { functions, secrets, pages, linkedWorkspace } from './business-disabled-release-reads.mts';
import {
  evidenceRecord,
  evidenceArray,
  evidenceRows,
  evidenceAssets,
} from './release-evidence.mts';
import {
  contractHash,
  windowGuard,
  assertSecretDigestsUnchanged,
} from './staff-workflow-release-guards.mts';
const root = 'test-results/staff-workflow-release',
  slug = 'employee-portal-v2';
const mode = process.argv[2];
assert.ok(mode === 'prepare' || mode === 'enable');
if (mode === 'enable') assert.equal(process.argv[3], '--approved-preview');
const read = async (name: string) =>
  evidenceRecord(JSON.parse(await readFile(`${root}/${name}.json`, 'utf8')));
const save = (name: string, v: unknown) =>
  writeFile(`${root}/${name}.json`, JSON.stringify(v, null, 2), { flag: 'wx' });
const c = await read('candidate'),
  a = await read('artifacts'),
  preview = await read('preview-verified');
async function infrastructure(version: number) {
  const current = functions();
  assert.equal(current.length, evidenceArray(c.functions).length);
  for (const old of evidenceArray(c.functions)) {
    const next = current.find((f) => f.id === old.id);
    assert.ok(next);
    if (old.slug === slug) assert.equal(next.version, version);
    else assert.deepEqual(next, old);
  }
  assertSecretDigestsUnchanged(secrets(), evidenceArray(c.secrets));
  assert.deepEqual(await pages(), preview.pages);
  for (const name of ['doji-admin', 'doji-business', 'doji-site']) {
    const p = evidenceRecord(await cf(`/pages/projects/${name}`));
    assert.equal(hash(JSON.stringify(p.deployment_configs)), evidenceRecord(c.configHashes)[name]);
  }
}
const query = (sql: string) =>
  evidenceRows(
    cli(['db', 'query', sql, '--linked', '--workdir', linkedWorkspace, '--output-format', 'json']),
  );
if (mode === 'prepare') {
  await infrastructure(12);
  assert.deepEqual(await inventory(`${root}/edge-after`), a.edge);
  await assert.rejects(access(`${root}/enable-candidate.json`));
  await cp(`${root}/edge-after`, `${root}/edge-enabled`, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  const path = `supabase/functions/${slug}/index.ts`,
    source = await readFile(`${root}/edge-enabled/${path}`, 'utf8');
  const marker = '          enabled: true,';
  assert.equal(source.split(marker).length, 2);
  await writeFile(
    `${root}/edge-enabled/${path}`,
    source.replace(marker, marker + '\n          staffWorkflowEnabled: true,'),
  );
  const edge = await inventory(`${root}/edge-enabled`);
  for (const f of evidenceAssets(a.edge))
    if (f.path !== path) assert.equal(edge.find((e) => e.path === f.path)?.sha256, f.sha256);
  await save('enable-candidate', { at: new Date().toISOString(), edge, onlyChanged: path });
  console.log('Prepared opt-in employee gate; no secret/provider/session change.');
} else {
  await infrastructure(12);
  const enable = await read('enable-candidate');
  assert.deepEqual(await inventory(`${root}/edge-enabled`), enable.edge);
  const expected = evidenceRecord(c.before).hash;
  assert.match(String(expected), /^[a-f0-9]{32}$/);
  await save('enable-started', {
    at: new Date().toISOString(),
    rollback: 'rollback-retain.sql plus exact employee v11 source and original Pages deployment',
  });
  // Database fence first; endpoint remains false until its exact activation deploy.
  query(`begin;set local lock_timeout='2s';set local statement_timeout='8s';do $$begin
 ${windowGuard}
 if (${contractHash})<>'${expected}' then raise exception 'Contract drift';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('doji-staff-workflow-v1',0)) then raise exception 'Concurrent release';end if;
 if (select enabled or extended_enabled or events_enabled from staff_workflow_private.settings where singleton) then raise exception 'Already enabled';end if;
 end$$;update staff_workflow_private.settings set enabled=true,extended_enabled=true,events_enabled=true where singleton;commit;`);
  try {
    cli(
      [
        'functions',
        'deploy',
        slug,
        '--project-ref',
        ref,
        '--use-api',
        '--workdir',
        `${root}/edge-enabled`,
      ],
      false,
    );
    await infrastructure(13);
    await mkdir(`${root}/enabled-verified`, { recursive: true });
    cli(
      [
        'functions',
        'download',
        slug,
        '--project-ref',
        ref,
        '--use-api',
        '--workdir',
        `${root}/enabled-verified`,
      ],
      false,
    );
    const actual = await inventory(`${root}/enabled-verified`);
    for (const f of evidenceAssets(enable.edge).filter((f) =>
      f.path.startsWith('supabase/functions/'),
    ))
      assert.equal(actual.find((x) => x.path === f.path)?.sha256, f.sha256);
    const gates = query(
      `begin read only;set local statement_timeout='8s';select enabled,extended_enabled,events_enabled from staff_workflow_private.settings where singleton;rollback;`,
    )[0];
    assert.deepEqual(gates, { enabled: true, extended_enabled: true, events_enabled: true });
    await save('enabled-verified', {
      at: new Date().toISOString(),
      version: 13,
      gates,
      rootUnchanged: true,
      ownerAcceptance: false,
    });
    console.log(
      'Gated employee preview enabled; exact source verified. Hosted acceptance is still pending.',
    );
  } catch (error) {
    // Fence immediately on deployment uncertainty; never retry a deploy/write.
    query(
      "begin;set local lock_timeout='2s';set local statement_timeout='8s';update staff_workflow_private.settings set enabled=false,extended_enabled=false,events_enabled=false where singleton;commit;",
    );
    await save('enable-fenced', { at: new Date().toISOString(), requiresInspection: true });
    throw error;
  }
}
