// Standalone, synthetic, network-disabled database qualification. No production URLs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCleanRoom, installManagedSchemas, replay } from './database/clean-room.mts';
import { engine } from './database/config.mts';
import { errorOutput } from './database/contracts.mts';
import { staffWorkflowOverlap } from './database/staff-workflow-races.mts';
import { extendedWorkflowRaces } from './database/staff-workflow-extended-races.mts';
import { qualifyStaffWorkflow } from './database/staff-workflow-qualification.mts';
import { staffWorkflowMemberOverlap } from './database/staff-workflow-member-overlap.mts';

assert.equal(process.argv.length, 2, 'No external database target is accepted');
const room = createCleanRoom();
const read = (path: string) => readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
const employee = (n: number) => `98000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const idea = '99000000-0000-4000-8000-000000000001';
const claim = (n: number) =>
  `set local request.jwt.claims='${JSON.stringify({ sub: employee(n), role: 'doji_employee', aal: 'aal2' })}';set local role doji_employee;`;
const sql = (value: string) =>
  room.sql(`set role postgres;set search_path=public,extensions;${value}`);
try {
  await room.start();
  installManagedSchemas(room);
  console.log(`PASS: ${(await replay(room)).length} real migrations replayed in offline container`);
  for (const name of [
    'business_applications_v1',
    'portal_identity_registry_v1',
    'employee_session_store_v1',
    'portal_employee_actors_v1',
    'portal_identity_employee_rpc_v1',
  ]) {
    try {
      sql(read(`docs/drafts/${name}.sql`));
    } catch (error) {
      console.error(
        sql(
          "select conname,pg_get_constraintdef(oid),convalidated,condeferrable from pg_constraint where conrelid='public.admin_employees'::regclass;show search_path;",
        ),
      );
      throw error;
    }
  }
  sql(`insert into portal_identity_private.realms(realm,issuer,audience) values('employee','https://employee.test','employee');
    insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data) values
    ('91000000-0000-4000-8000-000000000001','authenticated','authenticated','member@test.invalid',now(),
    jsonb_build_object('terms_version','2026-08-20','privacy_version','2026-08-20','terms_accepted_at',now(),'privacy_accepted_at',now()));
    insert into public.profiles(id,username,display_name) values
    ('91000000-0000-4000-8000-000000000001','workflow_fixture','Synthetic member');
    update public.admin_employee_cutover set employee_only=true;
    ${[1, 2, 3, 4, 5]
      .map(
        (
          n,
        ) => `select portal_identity_private.bind_identity('employee','user_staff_${n}','${employee(n)}','synthetic employee mapping');
    select portal_identity_private.prepare_employee_actor_v1('${employee(n)}','synthetic independent staff');
    insert into public.admin_employees(id,display_name,status,roles) values('${employee(n)}',
    '${n === 3 ? 'Operations' : 'Staff ' + n}','${n === 5 ? 'disabled' : 'active'}',array['${n === 3 ? 'operations' : n === 4 ? 'business_reviewer' : 'super_admin'}']);`,
      )
      .join('\n')}
    update business_private.settings set enabled=true,application_terms_version='terms-v1',privacy_version='privacy-v1';
    insert into public.challenge_suggestions(id,user_id,kind,body,body_hash,status) values('${idea}','91000000-0000-4000-8000-000000000001','question','Synthetic suggestion for staff workflow tests',md5('staff-workflow-synthetic'),'pending');
    insert into business_private.accounts(id) values('96000000-0000-4000-8000-000000000001');
    insert into business_private.applications(id,applicant_id,state,submitted_at) values
    ('99000000-0000-4000-8000-000000000002','96000000-0000-4000-8000-000000000001','pending',now());`);
  const fingerprint = () =>
    sql(`select md5(string_agg(x,'|' order by x)) from (
    select pg_get_functiondef(oid)||coalesce(proacl::text,'') x from pg_proc where prokind='f' and pronamespace in('public'::regnamespace,'auth'::regnamespace,'storage'::regnamespace)
     and proname not in('get_admin_case_ownership_v1','admin_case_ownership_command_v1','get_admin_owned_work_page_v1','get_admin_staff_work_page_v1','get_admin_staff_event_channels_v1')
    union all select to_jsonb(p)::text from pg_policies p
    union all select to_jsonb(u)::text from auth.users u
    union all select to_jsonb(p)::text from public.profiles p
    union all select to_jsonb(s)::text from public.challenge_suggestions s
    union all select to_jsonb(a)::text from business_private.applications a) existing;`);
  const before = fingerprint();
  sql(read('docs/drafts/staff_case_ownership_v1.sql'));
  sql(read('docs/drafts/staff_workflow_employee_bridge_v1.sql'));
  const bridgeOutput = sql(`begin;${read('scripts/test-staff-workflow-bridge.sql')}rollback;`);
  const bridgeChecks = bridgeOutput.split('\n').filter((line) => line.startsWith('PASS:'));
  assert.ok(bridgeChecks.length >= 20, 'Expected independent employee workflow checks');
  console.log(bridgeChecks.join('\n'));
  const output = sql(`begin;${read('scripts/test-staff-case-ownership.sql')}rollback;`);
  const checks = output.split('\n').filter((line) => line.startsWith('PASS:'));
  assert.ok(checks.length >= 35, 'Expected full ownership assertions');
  console.log(checks.join('\n'));
  sql('update staff_workflow_private.settings set enabled=true;');
  const version = sql(
    `begin;${claim(1)}select public.get_admin_case_ownership_v1('suggestion','${idea}')->>'source_version';commit;`,
  );
  const contend = (n: number, key = 'gen_random_uuid()') => `${claim(n)}
    select public.admin_case_ownership_command_v1('suggestion','${idea}',0,'${version}','claim',null,${key});`;
  const overlap = (first: string, second: string) =>
    staffWorkflowOverlap(room, engine, first, second);
  const race = await overlap(contend(1), contend(2));
  assert.notEqual(race.code, 0);
  assert.match(race.err, /Assignment changed/);
  assert.equal(sql('select count(*) from staff_workflow_private.history;'), '1');
  console.log('PASS: real concurrent claims produce one winner and one conflict, one history row');
  // Only this owned synthetic fixture is reset between independent race scenarios.
  const resetCase = () =>
    sql(
      `delete from staff_workflow_private.receipts;delete from staff_workflow_private.history where case_id='${idea}';delete from staff_workflow_private.ownership where case_id='${idea}';`,
    );
  resetCase();
  const duplicate = contend(1, "'97000000-0000-4000-8000-000000000099'");
  const retry = await overlap(duplicate, duplicate);
  assert.equal(retry.code, 0, retry.err);
  assert.match(retry.out, /"replayed": true/);
  assert.equal(
    sql(
      'select count(*) from staff_workflow_private.history;select count(*) from staff_workflow_private.receipts;',
    ),
    '1\n1',
  );
  console.log('PASS: overlapping identical retries create one receipt and one history entry');
  resetCase();
  const revoke = `update public.admin_employees set status='disabled' where id='${employee(3)}';`;
  const revoked = await overlap(revoke, contend(3));
  assert.notEqual(revoked.code, 0);
  assert.match(revoked.err, /Editorial permission required/);
  sql(`update public.admin_employees set status='active' where id='${employee(3)}';`);
  console.log('PASS: revocation during a claim is rechecked after the lock wait');
  const target = await overlap(
    revoke,
    `${claim(1)}select public.admin_case_ownership_command_v1('suggestion','${idea}',0,'${version}','assign','${employee(3)}',gen_random_uuid());`,
  );
  assert.notEqual(target.code, 0);
  assert.match(target.err, /Target employee cannot access/);
  sql(`update public.admin_employees set status='active' where id='${employee(3)}';`);
  console.log('PASS: target revocation during reassignment is not bypassed');
  const closed = await overlap(
    `update public.challenge_suggestions set status='rejected' where id='${idea}';`,
    contend(1),
  );
  assert.notEqual(closed.code, 0);
  assert.match(closed.err, /Work item changed/);
  sql(`update public.challenge_suggestions set status='pending' where id='${idea}';`);
  console.log('PASS: a concurrent domain decision prevents a stale claim');
  assert.equal(sql('select count(*) from staff_workflow_private.history;'), '0');
  sql(`begin;${contend(1)}rollback;`);
  assert.equal(
    sql(
      'select count(*) from staff_workflow_private.ownership;select count(*) from staff_workflow_private.receipts;',
    ),
    '0\n0',
  );
  console.log('PASS: transaction rollback leaves no assignment or orphaned receipt');
  sql(`begin;${contend(1)}commit;`);
  assert.equal(
    fingerprint(),
    before,
    'Existing functions, grants, policies, member and domain rows must not change',
  );
  console.log('PASS: member/auth/domain data and existing RPCs/grants/RLS unchanged');
  const performance = JSON.parse(
    sql(`begin;${read('scripts/test-staff-case-performance.sql')}rollback;`),
  ) as { filter: string; samples: number; p95_ms: number }[];
  assert.equal(performance.length, 3);
  for (const sample of performance) {
    assert.equal(sample.samples, 20);
    assert.ok(sample.p95_ms < 250, 'Local queue p95 exceeds the 250ms candidate budget');
  }
  console.log(`LOCAL PERFORMANCE (not production latency): ${JSON.stringify(performance)}`);
  assert.equal(fingerprint(), before, 'Performance fixtures must roll back');
  for (const name of ['business_privacy_v1', 'external_takedown_intake_v1']) {
    sql(read(`docs/drafts/${name}.sql`));
  }
  const beforeExpanded = fingerprint();
  for (const name of ['staff_workflow_extended_v1', 'staff_workflow_events_v1']) {
    sql(read(`docs/drafts/${name}.sql`));
  }
  const retainingRollback = read('docs/drafts/staff_workflow_extended_v1.rollback.sql')
    .replace(/^begin;\s*$/m, '')
    .replace(/^commit;\s*$/m, '');
  const bridgeFingerprint = () => sql("select md5(pg_get_functiondef(oid)||coalesce(proacl::text,'')) from pg_proc where oid='portal_identity_private.employee_workflow_rpc_v1(text,text,text,text,boolean,text,jsonb)'::regprocedure;");
  const bridgeBeforeSafety = bridgeFingerprint();
  sql(read('docs/drafts/staff_safety_queue_v1.sql'));
  const safetyChecks = sql(`begin;${read('scripts/test-staff-safety-queue.sql')}rollback;`)
    .split('\n').filter(line => line.startsWith('PASS:'));
  assert.ok(safetyChecks.length >= 24, 'Expected full unified safety queue checks');
  console.log(safetyChecks.join('\n'));
  sql('update staff_workflow_private.settings set safety_queue_enabled=true;');
  await staffWorkflowMemberOverlap(room, engine, true);
  const { qualifySafetyQueue } = await import('./database/staff-safety-qualification.mts');
  qualifySafetyQueue(room);
  sql(read('docs/drafts/staff_safety_queue_v1.rollback.sql'));
  assert.equal(bridgeFingerprint(), bridgeBeforeSafety, 'Safety rollback restores the exact prior employee dispatcher and grants');
  assert.equal(fingerprint(), beforeExpanded, 'Safety read rollback preserves existing member and domain contracts');
  console.log('PASS: unified safety read rollback restores existing contracts');
  const extended = sql(`begin;${read('scripts/test-staff-workflow-extended.sql')}
    select set_config('test.retained', (select count(*)::text from staff_workflow_private.history),true);
    ${retainingRollback}
    select pg_temp.ok((select count(*)::text from staff_workflow_private.history)=current_setting('test.retained'),'rollback retains new appeal/privacy history');
    rollback;`);
  const extendedChecks = extended.split('\n').filter((line) => line.startsWith('PASS:'));
  assert.ok(extendedChecks.length >= 30, 'Expected expanded inbox/event/ownership checks');
  console.log(extendedChecks.join('\n'));
  await extendedWorkflowRaces(room, engine);
  assert.equal(
    fingerprint(),
    beforeExpanded,
    'Expanded candidate preserves existing RPCs/grants/RLS/member rows',
  );
  console.log(
    'PASS: expanded candidate preserves existing member/domain contracts and fixture transactions roll back',
  );
  const expandedPerformance = read('scripts/test-staff-case-performance.sql').replace(
    "public.get_admin_owned_work_page_v1('all',filter,25,cursor_at,cursor_key)",
    "public.get_admin_staff_work_page_v1('all',filter,'all',25,cursor_at,cursor_key)",
  );
  const expandedSamples = JSON.parse(
    sql(`begin;update staff_workflow_private.settings set extended_enabled=true;
    ${expandedPerformance}rollback;`),
  ) as { samples: number; p95_ms: number }[];
  for (const sample of expandedSamples) {
    assert.equal(sample.samples, 20);
    assert.ok(sample.p95_ms < 250, 'Expanded queue exceeds local 250ms p95 budget');
  }
  console.log(
    `EXPANDED LOCAL PERFORMANCE (two populated bulk sources, not production): ${JSON.stringify(expandedSamples)}`,
  );
  qualifyStaffWorkflow(room, 'baseline');
  sql(read('docs/drafts/staff_workflow_queue_indexes_v1.sql'));
  qualifyStaffWorkflow(room, 'indexed');
  await staffWorkflowMemberOverlap(room, engine);
  assert.equal(
    fingerprint(),
    beforeExpanded,
    'Six-source qualification must roll back all fixtures',
  );
  sql(read('docs/drafts/staff_workflow_extended_v1.rollback.sql'));
  assert.equal(
    sql(
      "select extended_enabled or events_enabled from staff_workflow_private.settings;select count(*) from pg_trigger where tgname like 'staff_workflow_%';",
    ),
    'f\n0',
  );
  console.log('PASS: expanded rollback disables routes and removes only candidate event triggers');
  assert.equal(
    fingerprint(),
    beforeExpanded,
    'Expanded performance and rollback preserve existing contracts',
  );
  sql(read('docs/drafts/staff_workflow_employee_bridge_v1.rollback.sql'));
  assert.equal(
    sql(
      "select has_function_privilege('doji_employee_application','portal_identity_private.employee_workflow_rpc_v1(text,text,text,text,boolean,text,jsonb)','execute');select has_function_privilege('doji_employee_application','portal_identity_private.employee_rpc_v1(text,text,text,text,boolean,text,jsonb)','execute');",
    ),
    'f\nt',
  );
  console.log(
    'PASS: workflow bridge rollback revokes only the new dispatcher, keeping employee access intact',
  );
  sql(read('docs/drafts/staff_case_ownership_v1.rollback.sql'));
  assert.equal(
    sql(
      "select enabled from staff_workflow_private.settings;select count(*) from staff_workflow_private.history;select has_function_privilege('doji_employee','public.get_admin_case_ownership_v1(text,uuid)','execute');",
    ),
    'f\n1\nf',
  );
  console.log('PASS: rollback disables access and preserves recorded ownership/history');
  console.log(
    `${checks.length} ownership, ${bridgeChecks.length} bridge and ${extendedChecks.length} expanded checks, ten ownership race/rollback scenarios, member read/report coexistence, preservation and retaining rollback passed.`,
  );
  console.log(
    'Local six-source workflow qualification passed. Not deployed; hosted acceptance and shared rollout remain gated.',
  );
} catch (error) {
  console.error(
    (
      errorOutput(error, 'stderr') || (error instanceof Error ? error.message : String(error))
    ).slice(-6000),
  );
  process.exitCode = 1;
} finally {
  room.stop();
}
