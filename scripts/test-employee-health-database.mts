// Synthetic clean room only. Never accepts a production target or credentials.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { createCleanRoom, installManagedSchemas, replay } from './database/clean-room.mts';
import { errorOutput } from './database/contracts.mts';
import { engine } from './database/config.mts';
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
    'workflow_health_v1',
  ])
    sql(read(`supabase/overlays/${name}.sql`));
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
 and proname not in('record_employee_health_change_v1','get_admin_health_feed_v1','employee_health_rpc_v1',
 'capture_employee_health_snapshot_v1','get_admin_health_snapshot_v1','employee_health_snapshot_rpc_v1',
 'record_monitor_observation_v1','get_monitor_incident_history_v1','get_monitor_heartbeat_v1',
 'get_admin_monitor_history_v1','employee_monitor_history_rpc_v1')
 union all select to_jsonb(p)::text from pg_policies p where schemaname not in('employee_health_private','employee_health_snapshot_private')
 union all select to_jsonb(u)::text from auth.users u
 union all select to_jsonb(p)::text from public.profiles p) preserved;`);
  const before = fingerprint();
  sql(read('supabase/overlays/employee_health_feed_v1.sql'));
  const output = sql(`begin;${read('scripts/test-employee-health-database.sql')}rollback;`);
  const checks = output.split('\n').filter((line) => line.startsWith('PASS:'));
  assert.ok(checks.length >= 20, 'Expected complete health database assertions');
  console.log(checks.join('\n'));
  assert.equal(fingerprint(), before);
  console.log('PASS: existing functions, grants, policies and member rows unchanged');
  sql(read('supabase/overlays/employee_health_feed_v1.rollback.sql'));
  assert.equal(fingerprint(), before);
  assert.equal(sql("select to_regnamespace('employee_health_private') is null;"), 't');
  console.log('PASS: exact inverse restores previous contracts and removes only candidate objects');
  sql(read('supabase/overlays/employee_health_snapshot_v1.sql'));
  console.log(sql(read('scripts/test-employee-health-snapshot.sql')));
  sql('update employee_health_snapshot_private.settings set enabled=true;');
  const holder = execFile(
    engine,
    [
      'exec',
      '-i',
      room.name,
      'psql',
      '-X',
      '-qAt',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    { timeout: 10000 },
  );
  const closed = new Promise<void>((resolve) => {
    holder.on('close', () => resolve());
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Synthetic lock setup timed out')), 5000);
      const finish = (error?: Error) => {
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      holder.once('error', finish);
      holder.once('close', () => finish(Error('Synthetic lock holder closed early')));
      let output = '';
      holder.stdout?.on('data', (chunk: string) => {
        output += chunk;
        if (output.includes('SNAPSHOT_LOCK_HELD')) finish();
      });
      holder.stdin?.write(
        'begin;select pg_advisory_xact_lock(682019,1);\n\\echo SNAPSHOT_LOCK_HELD\n',
      );
    });
    assert.throws(
      () =>
        sql(`select public.capture_employee_health_snapshot_v1('ohrcupagdoilkwhecict',
      jsonb_build_object('healthy',true,'checked_at',clock_timestamp()));`),
      (error: unknown) => /lock timeout/.test(errorOutput(error, 'stderr')),
    );
    console.log('PASS: competing collector is bounded by database lock timeout');
  } finally {
    holder.stdin?.end('rollback;\n');
    await closed;
  }
  assert.equal(fingerprint(), before);
  const retained = sql(
    'select md5(row_to_json(s)::text) from employee_health_snapshot_private.snapshot s;',
  );
  sql(read('supabase/overlays/employee_health_snapshot_v1.rollback.sql'));
  assert.equal(
    sql('select md5(row_to_json(s)::text) from employee_health_snapshot_private.snapshot s;'),
    retained,
  );
  assert.equal(
    sql(
      "select not enabled and not has_function_privilege('service_role','public.capture_employee_health_snapshot_v1(text,jsonb)','EXECUTE') and not has_function_privilege('doji_employee','public.get_admin_health_snapshot_v1(boolean)','EXECUTE') from employee_health_snapshot_private.settings;",
    ),
    't',
  );
  assert.equal(fingerprint(), before);
  console.log(
    'PASS: snapshot rollback disables collection and reads, retains observations and original contracts',
  );
  sql(read('supabase/overlays/monitor_incident_history_v1.sql'));
  sql(read('supabase/overlays/employee_monitor_history_v1.sql'));
  assert.equal(fingerprint(), before, 'Monitor overlays preserve member functions, grants, policies and rows');
  console.log(sql(`begin;${read('scripts/test-employee-monitor-history.sql')}rollback;`));
  sql('update monitor_history_private.settings set enabled=true;');
  const monitorHolder = execFile(engine, ['exec','-i',room.name,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'], { timeout: 10000 });
  const monitorClosed = new Promise<void>(resolve => { monitorHolder.on('close', () => resolve()); });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Monitor lock setup timed out')), 5000);
      const finish = (error?: Error) => { clearTimeout(timer); if (error) reject(error); else resolve(); };
      monitorHolder.once('error', finish);
      monitorHolder.once('close', () => finish(Error('Monitor lock holder exited early')));
      let output = '';
      monitorHolder.stdout?.on('data', (chunk: string) => { output += chunk; if (output.includes('MONITOR_LOCK_HELD')) finish(); });
      monitorHolder.stdin?.write("begin;select 1 from monitor_history_private.latest where monitor='worker' for update;\n\\echo MONITOR_LOCK_HELD\n");
    });
    assert.throws(() => sql("select public.record_monitor_observation_v1('worker',gen_random_uuid(),clock_timestamp(),'healthy',null);"),
      (error: unknown) => /lock timeout/.test(errorOutput(error, 'stderr')));
    assert.equal(sql('select count(*) from monitor_history_private.incidents;'), '0');
    console.log('PASS: concurrent history writer is bounded and leaves no partial incident');
  } finally { monitorHolder.stdin?.end('rollback;\n'); await monitorClosed; }
  sql(read('supabase/overlays/employee_monitor_history_v1.rollback.sql'));
  assert.equal(sql("select to_regprocedure('public.get_admin_monitor_history_v1()') is null;"), 't');
  assert.equal(sql("select to_regclass('monitor_history_private.incidents') is not null;"), 't');
  assert.equal(fingerprint(), before);
} catch (error) {
  console.error(errorOutput(error, 'stderr'));
  throw error;
} finally {
  room.stop();
}
