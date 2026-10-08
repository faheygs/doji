// Exact approved business-only overlays, disabled. Never db push or enable signup.
import assert from 'node:assert/strict';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cli, hash, ref } from './prepare-safety-launch.mts';
import { evidenceRecord, evidenceRows, evidenceAssets } from './release-evidence.mts';
import {
  pages,
  functions,
  secrets,
  linkedWorkspace,
  health,
} from './business-disabled-release-reads.mts';
import {
  fingerprint,
  windowGuard,
  beforeTables,
  afterGuards,
  restoredGuards,
} from './business-bridge-release-guards.mts';
const root = 'test-results/business-independent-bridge-20261005';
const names = [
  'portal_identity_business_enrollment_v1',
  'portal_identity_business_reads_v1',
  'portal_identity_business_commands_v1',
  'business_registration_gate_v1',
  'portal_identity_business_review_v1',
];
const rollbackNames = [
  'portal_identity_business_review_v1',
  'portal_identity_business_commands_v1',
];
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
const body = async (path: string) =>
  (await readFile(path, 'utf8'))
    .replaceAll('\r\n', '\n')
    .replace(/^begin;\s*$/m, '')
    .replace(/^commit;\s*$/m, '');
const state = () =>
  evidenceRecord(
    query(`begin read only;set local statement_timeout='8s';select jsonb_build_object(
 'fingerprint',(${fingerprint}),
 'installed',to_regclass('portal_identity_private.business_review_restore') is not null,
 'event_window',exists(select 1 from public.daily_events where fires_at<=clock_timestamp()+interval '25 minutes'
  and fires_at+interval '15 minutes'>clock_timestamp() limit 1)) as state;rollback;`)[0]?.state,
  );
async function infrastructure() {
  return { pages: await pages(), functions: functions(), secrets: secrets() };
}
assert.equal((await readFile(`${linkedWorkspace}/supabase/.temp/project-ref`, 'utf8')).trim(), ref);
await mkdir(root, { recursive: true });
if (mode === 'prepare') {
  await assert.rejects(access(`${root}/candidate.json`));
  const before = state();
  assert.equal(before.installed, false);
  assert.equal(before.event_window, false);
  const files = await Promise.all(
    [
      ...names.map((n) => `docs/drafts/${n}.sql`),
      ...rollbackNames.map((n) => `docs/drafts/${n}.rollback.sql`),
    ].map(async (path) => ({ path, sha256: hash(await readFile(path)) })),
  );
  const install = (await Promise.all(names.map((n) => body(`docs/drafts/${n}.sql`)))).join('\n');
  const rollback = (
    await Promise.all(rollbackNames.map((n) => body(`docs/drafts/${n}.rollback.sql`)))
  ).join('\n');
  const start = `begin;set local lock_timeout='2s';set local statement_timeout='8s';
    do $$begin
    if not pg_try_advisory_xact_lock(hashtextextended('doji-business-independent-bridge-v1',0)) then raise exception 'Concurrent release';end if;
    if (${fingerprint})<>'${before.fingerprint}' then raise exception 'Database contract drift';end if;
    ${windowGuard}
    if exists(select 1 from business_private.accounts) then raise exception 'Existing account needs migration review';end if;
    end$$;${beforeTables}`;
  await writeFile(`${root}/install.sql`, `${start}\n${install}\n${afterGuards}\ncommit;`, {
    flag: 'wx',
  });
  await writeFile(
    `${root}/rehearse.sql`,
    `${start}\n${install}\n${afterGuards}\n${rollback}\n${restoredGuards}\nrollback;`,
    { flag: 'wx' },
  );
  await writeFile(
    `${root}/rollback.sql`,
    `begin;set local lock_timeout='2s';set local statement_timeout='8s';
    ${rollback}
    update business_session_private.settings set enabled=false,registration_enabled=false where singleton;
    commit;`,
    { flag: 'wx' },
  );
  await save('candidate', {
    at: new Date().toISOString(),
    before,
    files,
    infrastructure: await infrastructure(),
    installHash: hash(await readFile(`${root}/install.sql`)),
    rehearseHash: hash(await readFile(`${root}/rehearse.sql`)),
  });
  console.log(
    'Prepared exact disabled business bridge, transactional rehearsal and retaining rollback. No production writes.',
  );
} else {
  const candidate = await read('candidate');
  for (const file of evidenceAssets(candidate.files))
    assert.equal(hash(await readFile(file.path)), file.sha256);
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
      await save('rehearsed', {
        at: new Date().toISOString(),
        installHash: candidate.installHash,
        exactRollback: true,
      });
      console.log('Live transaction rehearsal and exact rollback passed; no changes retained.');
      process.exit(0);
    }
  }
  const after = state();
  assert.equal(after.installed, true);
  assert.equal(after.event_window, false);
  const gates = query(`begin read only;set local statement_timeout='5s';select jsonb_build_object(
    'reads',(select enabled from portal_identity_private.business_read_settings where singleton),
    'commands',(select enabled from portal_identity_private.business_command_settings where singleton),
    'enrollment',(select enabled from portal_identity_private.business_enrollment_settings where singleton),
    'sessions',(select enabled from business_session_private.settings where singleton),
    'registration',(select registration_enabled from business_session_private.settings where singleton),
    'review_exact',not exists(select 1 from portal_identity_private.business_review_restore r
      where pg_get_functiondef(r.signature::regprocedure) is distinct from r.installed_definition),
    'legacy_command_exact',(select installed_definition=pg_get_functiondef('public.business_application_command_v1(text,bigint,jsonb,text,text,uuid)'::regprocedure)
      from portal_identity_private.command_restore where singleton)) as gates;rollback;`)[0]?.gates;
  assert.deepEqual(gates, {
    reads: false,
    commands: false,
    enrollment: false,
    sessions: false,
    registration: false,
    review_exact: true,
    legacy_command_exact: true,
  });
  assert.deepEqual(await infrastructure(), candidate.infrastructure);
  await save(`verified-${Date.now()}`, {
    at: new Date().toISOString(),
    after,
    gates,
    health: await health(),
    cutover: false,
  });
  console.log(
    'Exact business bridge installed and verified with all new gates DISABLED; infrastructure unchanged.',
  );
}
