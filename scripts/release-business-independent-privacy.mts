// Separately approved additive privacy install. All business activation gates stay off.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cli, hash, ref } from './prepare-safety-launch.mts';
import { evidenceRecord, evidenceRows } from './release-evidence.mts';
import {
  linkedWorkspace,
  pages,
  functions,
  secrets,
  health,
} from './business-disabled-release-reads.mts';
import {
  fingerprint,
  windowGuard,
  beforeTables,
  afterGuards,
  restoredGuards,
} from './business-bridge-release-guards.mts';
const root = 'test-results/business-independent-privacy-20261005';
const source = 'docs/drafts/portal_identity_business_privacy_v1.sql';
const mode = process.argv[2];
assert.ok(mode && ['prepare', 'rehearse', 'apply', 'verify'].includes(mode));
const query = (sql: string) =>
  evidenceRows(
    cli(['db', 'query', sql, '--linked', '--workdir', linkedWorkspace, '--output-format', 'json']),
  );
const save = (name: string, data: unknown) =>
  writeFile(`${root}/${name}.json`, JSON.stringify(data, null, 2), { flag: 'wx' });
const read = async (name: string) =>
  evidenceRecord(JSON.parse(await readFile(`${root}/${name}.json`, 'utf8')));
async function immutableFile(path: string, contents: string) {
  try {
    await writeFile(path, contents, { flag: 'wx' });
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
    assert.equal(
      await readFile(path, 'utf8'),
      contents,
      'Interrupted preparation differs; stop for review',
    );
  }
}
const infrastructure = async () => ({
  pages: await pages(),
  functions: functions(),
  secrets: secrets(),
});
const state = () =>
  evidenceRecord(
    query(
      `begin read only;set local statement_timeout='8s';select jsonb_build_object('fingerprint',(${fingerprint}),'installed',to_regclass('portal_identity_private.business_privacy_settings') is not null) as state;rollback;`,
    )[0]?.state,
  );
assert.equal((await readFile(`${linkedWorkspace}/supabase/.temp/project-ref`, 'utf8')).trim(), ref);
await mkdir(root, { recursive: true });
if (mode === 'prepare') {
  await assert.rejects(access(`${root}/candidate.json`));
  const before = state();
  assert.equal(before.installed, false);
  const sql = (await readFile(source, 'utf8'))
    .replaceAll('\r\n', '\n')
    .replace(/^begin;\s*$/m, '')
    .replace(/^commit;\s*$/m, '');
  const start = `begin;set local lock_timeout='2s';set local statement_timeout='8s';do $$begin
 if not pg_try_advisory_xact_lock(hashtextextended('doji-business-privacy-v1',0)) then raise exception 'Concurrent release';end if;
 if (${fingerprint})<>'${before.fingerprint}' then raise exception 'Database contract drift';end if;
 ${windowGuard}
 if exists(select 1 from business_session_private.records) then raise exception 'Existing sessions require reviewed migration';end if;
 end$$;${beforeTables}`;
  const end = `${afterGuards}${restoredGuards}
 do $$begin
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
 unnest(array['anon','authenticated','service_role','doji_employee','doji_business','doji_identity_resolver','doji_business_enrollment','doji_business_session','doji_business_portal_login']) r
 where n.nspname='portal_identity_private' and p.proname in('business_privacy_target','export_business_identity_target','claim_business_identity_erasure','finish_business_identity_erasure') and has_function_privilege(r,p.oid,'execute')) then raise exception 'Privacy operator unexpectedly exposed';end if;
 end$$;`;
  const rollback = await readFile(
    'docs/drafts/portal_identity_business_privacy_v1.rollback.sql',
    'utf8',
  );
  await immutableFile(`${root}/install.sql`, `${start}\n${sql}\n${end}\ncommit;`);
  await immutableFile(
    `${root}/rehearse.sql`,
    `${start}\n${sql}\n${end}\n${rollback.replace(/^begin;\s*$/m, '').replace(/^commit;\s*$/m, '')}\nrollback;`,
  );
  await save('candidate', {
    at: new Date().toISOString(),
    before,
    sourceHash: hash(await readFile(source)),
    installHash: hash(await readFile(`${root}/install.sql`)),
    rehearseHash: hash(await readFile(`${root}/rehearse.sql`)),
    infrastructure: await infrastructure(),
  });
  console.log('Privacy installation and retaining rollback prepared; no production changes.');
} else {
  const candidate = await read('candidate');
  assert.equal(hash(await readFile(source)), candidate.sourceHash);
  assert.equal(hash(await readFile(`${root}/install.sql`)), candidate.installHash);
  assert.equal(hash(await readFile(`${root}/rehearse.sql`)), candidate.rehearseHash);
  assert.deepEqual(await infrastructure(), candidate.infrastructure);
  if (mode === 'rehearse' || mode === 'apply') {
    assert.deepEqual(state(), candidate.before);
    if (mode === 'apply') {
      assert.equal((await read('rehearsed')).installHash, candidate.installHash);
      await save('apply-started', {
        at: new Date().toISOString(),
        installHash: candidate.installHash,
      });
    }
    cli([
      'db',
      'query',
      '--file',
      resolve(`${root}/${mode === 'apply' ? 'install' : 'rehearse'}.sql`),
      '--linked',
      '--workdir',
      linkedWorkspace,
      '--output-format',
      'json',
    ]);
    if (mode === 'rehearse') {
      assert.deepEqual(state(), candidate.before);
      await save('rehearsed', { at: new Date().toISOString(), installHash: candidate.installHash });
      console.log('Transactional production rehearsal passed; all changes rolled back.');
      process.exit(0);
    }
  }
  const after = state();
  assert.equal(after.installed, true);
  const gate = query(
    'begin read only;select enabled from portal_identity_private.business_privacy_settings where singleton;rollback;',
  );
  assert.equal(gate[0]?.enabled, false);
  assert.deepEqual(await infrastructure(), candidate.infrastructure);
  await save(`verified-${Date.now()}`, {
    at: new Date().toISOString(),
    after,
    privacyEnabled: false,
    health: await health(),
  });
  console.log(
    'Business privacy bridge installed disabled. Existing functions, grants, RLS, deployments and activation gates preserved.',
  );
}
