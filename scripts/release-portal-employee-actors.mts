// Exact owner-approved nine-reference migration; no login or account cutover.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { cli, cf, hash, ref } from './prepare-safety-launch.mts';
import {evidenceRecord,evidenceAt,evidenceArray,evidenceRows,evidenceText} from './release-evidence.mts';
const root = 'test-results/portal-employee-actors-20261001';
const source = 'docs/drafts/portal_employee_actors_v1.sql';
const mode = process.argv[2];
assert.ok(mode&&['prepare', 'rehearse', 'apply', 'verify'].includes(mode));
assert.equal((await readFile('supabase/.temp/project-ref', 'utf8')).trim(), ref);
const tables = [
  'admin_employees',
  'admin_employee_access_events',
  'admin_employee_command_receipts',
  'admin_audit_log',
  'admin_report_triage',
  'moderation_decisions',
  'moderation_appeals',
];
const constraints = [
  'admin_employees_id_fkey',
  'admin_employee_access_events_actor_id_fkey',
  'admin_employee_command_receipts_user_id_fkey',
  'admin_audit_log_actor_id_employee_fkey',
  'admin_report_triage_assigned_to_employee_fkey',
  'admin_report_triage_resolved_by_employee_fkey',
  'moderation_decisions_decided_by_employee_fkey',
  'moderation_decisions_reversed_by_employee_fkey',
  'moderation_appeals_reviewed_by_employee_fkey',
];
const list = (values:string[]) => values.map((v) => `'${v}'`).join(',');
const save = (name:string, value:unknown) =>
  writeFile(`${root}/${name}.json`, JSON.stringify(value, null, 2), { flag: 'wx' });
const read = async (name:string) => evidenceRecord(JSON.parse(await readFile(`${root}/${name}.json`, 'utf8')));
const query = (sql:string) => evidenceRows(cli(['db', 'query', sql, '--linked', '--output-format', 'json']));
const fingerprint = `select md5(jsonb_build_object(
 'functions',(select jsonb_agg(jsonb_build_array(p.oid,pg_get_functiondef(p.oid),p.proacl::text) order by p.oid) from pg_proc p where p.prokind='f' and p.pronamespace in('public'::regnamespace,'auth'::regnamespace,'storage'::regnamespace,'business_private'::regnamespace)),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p where schemaname in('public','auth','storage','business_private')),
 'relations',(select jsonb_agg(jsonb_build_array(c.oid,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity) order by c.oid) from pg_class c where c.relnamespace in('public'::regnamespace,'auth'::regnamespace,'storage'::regnamespace,'business_private'::regnamespace) and c.relkind in('r','p','v','m')),
 'foreign_keys',(select jsonb_agg(jsonb_build_array(c.conrelid,c.conname,pg_get_constraintdef(c.oid)) order by c.conrelid,c.conname) from pg_constraint c where c.contype='f' and c.connamespace in('public'::regnamespace,'auth'::regnamespace,'storage'::regnamespace,'business_private'::regnamespace) and not(c.connamespace='public'::regnamespace and c.conname in(${list(constraints)}))),
 'triggers',(select jsonb_agg(jsonb_build_array(t.oid,pg_get_triggerdef(t.oid),t.tgenabled) order by t.oid) from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and c.relnamespace in('public'::regnamespace,'auth'::regnamespace,'storage'::regnamespace,'business_private'::regnamespace) and t.tgname<>'ensure_staff_attribution_v1')
 )::text)`;
const state = () =>
  query(`begin read only;set local statement_timeout='8s';select jsonb_build_object(
 'fingerprint',(${fingerprint}),
 'installed',to_regclass('portal_identity_private.staff_actors') is not null,
 'references',(select jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid),'valid',c.convalidated) order by c.conname) from pg_constraint c where c.connamespace='public'::regnamespace and c.conname in(${list(constraints)})),
 'active_event',exists(select 1 from public.daily_events where fires_at<=clock_timestamp()+interval '2 minutes' and fires_at+interval '12 minutes'>clock_timestamp() limit 1)
 ) state;rollback;`)[0]?.state;
async function pages() {
  const result:Record<string,unknown> = {};
  for (const name of ['doji-admin', 'doji-business', 'doji-site']) {
    const p = await cf('/pages/projects/' + name);
    result[name] = evidenceAt(p,'canonical_deployment').id;
  }
  return result;
}
const safe = (value:unknown) => {
  const before=evidenceRecord(value);
  assert.equal(before.active_event, false);
  assert.equal(before.installed, false);
  assert.equal(evidenceArray(before.references).length, 9);
  for (const r of evidenceArray(before.references)) {
    assert.equal(r.valid, true);
    assert.ok(evidenceText(r.definition).includes('REFERENCES auth.users(id)'));
  }
};
if (mode === 'prepare') {
  await mkdir(root, { recursive: true });
  const before = evidenceRecord(state());
  safe(before);
  const sourceText = await readFile(source, 'utf8');
  const body = sourceText.replace(/^begin;\s*$/m, '').replace(/^commit;\s*$/m, '');
  // Snapshot only bounded attribution tables, internally hashed; never export cases.
  const history = tables
    .map(
      (t) =>
        `select '${t}' relation,count(*) n,md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' order by md5(to_jsonb(x)::text)),'')) fingerprint from public.${t} x`,
    )
    .join(' union all ');
  const sql = `begin;set local lock_timeout='2s';set local statement_timeout='8s';
 do $$begin
  if not pg_try_advisory_xact_lock(hashtextextended('doji-portal-staff-attribution-v1',0)) then raise exception 'Concurrent staff deployment';end if;
  if (${fingerprint})<>'${before.fingerprint}' then raise exception 'Existing contract drift';end if;
  if exists(select 1 from public.daily_events where fires_at<=clock_timestamp()+interval '2 minutes' and fires_at+interval '12 minutes'>clock_timestamp() limit 1) then raise exception 'Event window: stop deployment';end if;
 end$$;
 ${tables.map((t) => `lock table public.${t} in access exclusive mode;`).join('\n')}
 do $$begin
 ${tables.map((t) => `if (select count(*) from (select 1 from public.${t} limit 20001) x)>20000 then raise exception 'Attribution snapshot exceeds reviewed bound';end if;`).join('\n')}
 end$$;
 create temp table staff_history_before on commit drop as ${history};
 ${body}
 do $$begin
  if (${fingerprint})<>'${before.fingerprint}' then raise exception 'Unrelated contract changed';end if;
  if exists((select * from staff_history_before except (${history})) union all ((${history}) except select * from staff_history_before)) then raise exception 'Attribution history changed';end if;
  if (select count(*) from portal_identity_private.staff_reference_migration)<>9 or
   (select count(*) from pg_constraint where contype='f' and confrelid='portal_identity_private.staff_actors'::regclass and convalidated)<>9 then raise exception 'Staff reference count mismatch';end if;
  if exists(select 1 from portal_identity_private.staff_actors where legacy_auth_id is null or employee_principal_id is not null) then raise exception 'Premature employee cutover';end if;
 end$$;
 commit;`;
  await writeFile(`${root}/install.sql`, sql, { flag: 'wx' });
  await writeFile(`${root}/rehearse.sql`, sql.replace(/commit;$/, 'rollback;'), { flag: 'wx' });
  await save('candidate', {
    at: new Date().toISOString(),
    source,
    sourceHash: hash(sourceText),
    sqlHash: hash(sql),
    before,
    pages: await pages(),
  });
  console.log(
    'Prepared exact nine-reference deployment, historical-row guard and rollback record. No production change.',
  );
} else {
  const candidate = await read('candidate');
  assert.equal(hash(await readFile(source)), candidate.sourceHash);
  assert.equal(hash(await readFile(`${root}/install.sql`)), candidate.sqlHash);
  if (mode === 'rehearse' || mode === 'apply') {
    const fresh = state();
    safe(fresh);
    assert.deepEqual(fresh, candidate.before);
    assert.deepEqual(await pages(), candidate.pages);
    if (mode === 'apply') {
      assert.equal((await read('rehearsed')).sqlHash, candidate.sqlHash);
      await assert.rejects(
        access(`${root}/apply-started.json`),
        'Attempt exists: inspect before any retry',
      );
      await save('apply-started', { at: new Date().toISOString(), sqlHash: candidate.sqlHash });
    }
    cli([
      'db',
      'query',
      '--file',
      `${root}/${mode === 'apply' ? 'install' : 'rehearse'}.sql`,
      '--linked',
      '--output-format',
      'json',
    ]);
    if (mode === 'rehearse') {
      assert.deepEqual(state(), candidate.before);
      await save('rehearsed', { at: new Date().toISOString(), sqlHash: candidate.sqlHash });
      console.log(
        'Live transaction rehearsal passed and rolled back; existing contracts and history preserved.',
      );
      process.exit(0);
    }
  }
  const after = evidenceRecord(state());
  assert.equal(after.installed, true);
  assert.equal(after.fingerprint, evidenceAt(candidate,'before').fingerprint);
  assert.equal(evidenceArray(after.references).length, 9);
  for (const r of evidenceArray(after.references)) {
    assert.equal(r.valid, true);
    const old = evidenceArray(evidenceAt(candidate,'before').references).find((v) => v.name === r.name);assert.ok(old);
    assert.equal(
      r.definition,
      evidenceText(old.definition).replace('auth.users', 'portal_identity_private.staff_actors'),
    );
  }
  const check = query(`begin read only;set local statement_timeout='5s';select jsonb_build_object(
 'references',(select count(*) from portal_identity_private.staff_reference_migration),
 'triggers',(select count(*) from pg_trigger where not tgisinternal and tgname='ensure_staff_attribution_v1' and tgenabled='O'),
 'external_actors',(select count(*) from portal_identity_private.staff_actors where employee_principal_id is not null),
 'enabled_realms',(select count(*) from portal_identity_private.realms where enabled),
 'employee_sessions_enabled',(select enabled from employee_session_private.settings),
 'member_actor_read',has_table_privilege('authenticated','portal_identity_private.staff_actors','select'),
 'resolver_can_provision',has_function_privilege('doji_identity_resolver','portal_identity_private.prepare_employee_actor_v1(uuid,text)','execute')) state;rollback;`)[0]
    ?.state;
  assert.deepEqual(check, {
    references: 9,
    triggers: 7,
    external_actors: 0,
    enabled_realms: 0,
    employee_sessions_enabled: false,
    member_actor_read: false,
    resolver_can_provision: false,
  });
  assert.deepEqual(await pages(), candidate.pages);
  await save(`verified-${Date.now()}`, {
    at: new Date().toISOString(),
    after,
    check,
    historyGuardPassed: true,
    loginCutover: false,
  });
  console.log(
    'Nine staff references migrated and verified; actor history, unrelated contracts and portal deployments preserved. Independent login remains disabled.',
  );
}
