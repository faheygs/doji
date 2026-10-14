// Repeatable source regression: disposable offline PostgreSQL, no remote targets.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createCleanRoom, installManagedSchemas, replay } from './database/clean-room.mts';
import { errorOutput } from './database/contracts.mts';
assert.equal(process.argv.length, 2);
const room = createCleanRoom();
const read = (path: string) => readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
const sql = (query: string) =>
  room.sql(
    'set role postgres;set search_path=public,extensions;set client_min_messages=error;\n' + query,
  );
const employee = (n: number) => `98000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const definitionSnapshot = () =>
  sql(`select md5(string_agg(value,'|' order by value)) from (
 select pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'')||p.proowner::text value
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind='f'
 and n.nspname in ('public','auth','storage','portal_identity_private','staff_workflow_private')
 and p.proname not in ('get_admin_personal_work_page_v1','get_admin_announcement_lifecycle_page_v1','history_reads_actor','employee_history_rpc_v1')
 union all select to_jsonb(p)::text from pg_policies p
 union all select oid::text||coalesce(relacl::text,'')||relrowsecurity::text from pg_class
 where relnamespace in ('public'::regnamespace,'auth'::regnamespace,'storage'::regnamespace)) s;`);
try {
  await room.start();
  installManagedSchemas(room);
  const migrations = await replay(room);
  console.log(`PASS: ${migrations.length} current migrations; no migration excluded`);
  for (const name of [
    'business_applications_v1',
    'portal_identity_registry_v1',
    'employee_session_store_v1',
    'portal_employee_actors_v1',
    'portal_identity_employee_rpc_v1',
    'staff_case_ownership_v1',
    'staff_workflow_employee_bridge_v1',
    'business_privacy_v1',
    'external_takedown_intake_v1',
    'staff_workflow_extended_v1',
    'staff_workflow_events_v1',
    'staff_workflow_queue_indexes_v1',
  ]) {
    sql(read('supabase/overlays/' + name + '.sql'));
  }
  sql(`insert into portal_identity_private.realms(realm,issuer,audience) values('employee','https://employee.test','employee');
    insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data) values
    ('91000000-0000-4000-8000-000000000001','authenticated','authenticated','history-member@test.invalid',now(),
    jsonb_build_object('terms_version','2026-08-20','privacy_version','2026-08-20','terms_accepted_at',now(),'privacy_accepted_at',now()));
    insert into public.profiles(id,username,display_name) values
    ('91000000-0000-4000-8000-000000000001','history_fixture','Synthetic history member');
    update public.admin_employee_cutover set employee_only=true;
    ${[1, 2, 3, 4, 5]
      .map(
        (
          n,
        ) => `select portal_identity_private.bind_identity('employee','user_history_${n}','${employee(n)}','synthetic history mapping');
      select portal_identity_private.prepare_employee_actor_v1('${employee(n)}','synthetic independent employee');
      insert into public.admin_employees(id,display_name,status,roles) values('${employee(n)}','Synthetic ${n}',
      '${n === 5 ? 'disabled' : 'active'}',array['${n === 2 ? 'moderator' : n === 3 ? 'operations' : n === 4 ? 'business_reviewer' : 'super_admin'}']);`,
      )
      .join('\n')}
    update business_private.settings set enabled=true,application_terms_version='terms-v1',privacy_version='privacy-v1';
    update staff_workflow_private.settings set enabled=true,extended_enabled=true;
    update business_private.privacy_settings set enabled=true;`);
  const before = definitionSnapshot();
  sql(read('supabase/overlays/employee_history_reads_v1.sql'));
  sql(read('supabase/overlays/employee_history_bridge_v1.sql'));
  assert.equal(definitionSnapshot(), before, 'Existing functions, grants, owners, RLS unchanged');
  // Reuse six-source fixtures; tie every timestamp to exercise cross-kind cursor order.
  const fixture = read('scripts/database/staff-workflow-volume.sql');
  const small = fixture
    .replace('generate_series(1,5000)', 'generate_series(1,150)')
    .replaceAll('2500', '75')
    .replace("+n*interval '1 second'", '');
  const checks = sql(
    "begin;set local statement_timeout='30s';\n" +
      small +
      '\n' +
      read('scripts/test-employee-history-reads.sql') +
      '\nrollback;',
  );
  console.log(
    checks
      .split('\n')
      .filter((line) => line.startsWith('PASS:'))
      .join('\n'),
  );
  assert.equal(definitionSnapshot(), before);
  const performance = sql(
    "begin;set local statement_timeout='90s';\n" +
      fixture +
      '\n' +
      read('scripts/test-employee-history-performance.sql') +
      '\nrollback;',
  );
  console.log(performance);
  assert.equal(definitionSnapshot(), before);
  sql(read('supabase/overlays/employee_history_bridge_v1.rollback.sql'));
  sql(read('supabase/overlays/employee_history_reads_v1.rollback.sql'));
  assert.equal(definitionSnapshot(), before, 'Rollback preserves all prior contracts');
  assert.equal(
    sql(`select to_regprocedure('public.get_admin_personal_work_page_v1(text,text,integer,timestamptz,text)') is null;
    select to_regprocedure('public.get_admin_announcement_lifecycle_page_v1(text,integer,timestamptz,uuid)') is null;`),
    't\nt',
  );
  const output = `test-results/employee-history-reads-${Date.now()}`;
  mkdirSync(output, { recursive: true });
  writeFileSync(
    output + '/verified.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        productionChanged: false,
        deployedByThisRun: false,
        migrations,
        candidateSha256: createHash('sha256')
          .update(read('supabase/overlays/employee_history_reads_v1.sql'))
          .digest('hex'),
        checks: checks.split('\n').filter((line) => line.startsWith('PASS:')),
        performance,
        existingContractsPreserved: true,
        rollbackPassed: true,
        limitations: [
          'Synthetic offline timing, not production capacity',
          'This run validates source, not current hosted runtime/UI or deployment status',
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: local history permissions, paging, member preservation and rollback. No deployment performed.',
  );
} catch (error) {
  console.error(
    errorOutput(error, 'stderr') || (error instanceof Error ? error.stack : String(error)),
  );
  process.exitCode = 1;
} finally {
  room.stop();
}
