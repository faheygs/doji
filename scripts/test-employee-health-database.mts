// Synthetic clean room only. Never accepts a production target or credentials.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCleanRoom, installManagedSchemas, replay } from './database/clean-room.mts';
import { errorOutput } from './database/contracts.mts';
assert.equal(process.argv.length, 2);
const room = createCleanRoom();
const read = (name: string) => readFileSync(name, 'utf8').replaceAll('\r\n', '\n');
const sql = (value: string) =>
  room.sql(`set role postgres;set search_path=public,extensions;${value}`);
try {
  await room.start();
  installManagedSchemas(room);
  console.log(`PASS: ${(await replay(room)).length} migrations replayed offline`);
  for (const name of [
    'business_applications_v1',
    'portal_identity_registry_v1',
    'employee_session_store_v1',
    'portal_employee_actors_v1',
    'portal_identity_employee_rpc_v1',
  ])
    sql(read(`docs/drafts/${name}.sql`));
  sql(`insert into portal_identity_private.realms(realm,issuer,audience,enabled) values('employee','https://employee.test','employee',true);
 update public.admin_employee_cutover set employee_only=true;
 update portal_identity_private.employee_rpc_settings set enabled=true;
 ${[1, 2]
   .map(
     (
       n,
     ) => `select portal_identity_private.bind_identity('employee','user_health_${n}','98100000-0000-4000-8000-00000000000${n}','synthetic health testing');
 select portal_identity_private.prepare_employee_actor_v1('98100000-0000-4000-8000-00000000000${n}','synthetic health testing');
 insert into public.admin_employees(id,display_name,status,roles) values('98100000-0000-4000-8000-00000000000${n}','Synthetic health staff','active',array['${n === 1 ? 'operations' : 'business_reviewer'}']);`,
   )
   .join('\n')}
 select portal_identity_private.set_principal_state(id,revision,'active','synthetic health testing') from portal_identity_private.principals where realm='employee';`);
  const fingerprint = () =>
    sql(`select md5(string_agg(x,'|' order by x)) from (
 select pg_get_functiondef(oid)||coalesce(proacl::text,'') x from pg_proc where prokind='f' and pronamespace in('public'::regnamespace,'auth'::regnamespace,'storage'::regnamespace,'portal_identity_private'::regnamespace)
 and proname not in('record_employee_health_change_v1','get_admin_health_feed_v1','employee_health_rpc_v1')
 union all select to_jsonb(p)::text from pg_policies p where schemaname<>'employee_health_private'
 union all select to_jsonb(u)::text from auth.users u
 union all select to_jsonb(p)::text from public.profiles p) preserved;`);
  const before = fingerprint();
  sql(read('docs/drafts/employee_health_feed_v1.sql'));
  const output = sql(`begin;${read('scripts/test-employee-health-database.sql')}rollback;`);
  const checks = output.split('\n').filter((line) => line.startsWith('PASS:'));
  assert.ok(checks.length >= 20, 'Expected complete health database assertions');
  console.log(checks.join('\n'));
  assert.equal(fingerprint(), before);
  console.log('PASS: existing functions, grants, policies and member rows unchanged');
  sql(read('docs/drafts/employee_health_feed_v1.rollback.sql'));
  assert.equal(fingerprint(), before);
  assert.equal(sql("select to_regnamespace('employee_health_private') is null;"), 't');
  console.log('PASS: exact inverse restores previous contracts and removes only candidate objects');
} catch (error) {
  console.error(errorOutput(error, 'stderr'));
  throw error;
} finally {
  room.stop();
}
