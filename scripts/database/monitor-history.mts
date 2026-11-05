// Synthetic, network-disabled database only. Never accepts a remote target.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestRoom } from './contracts.mts';
export function monitorHistory(room: TestRoom) {
room.inspect();
const sql = (text: string) => room.sql(`set role postgres;${text}`);
const source = (name: string) => readFileSync(new URL(`../../supabase/overlays/${name}`, import.meta.url), 'utf8');
  const fingerprint = () => sql(`select md5(coalesce(string_agg(pg_get_functiondef(oid)||coalesce(proacl::text,''),'|' order by oid),''))
    from pg_proc where prokind='f' and pronamespace='public'::regnamespace
    and proname not in('record_monitor_observation_v1','get_monitor_incident_history_v1','get_monitor_heartbeat_v1');`);
  const before = fingerprint();
  sql(source('monitor_incident_history_v1.sql'));
  // Fixed synthetic timestamps remain within the acceptance window throughout the suite.
  const epoch = Date.now() - 60_000;
  const record = (n: number, state = 'degraded', family: string | null = 'domain-outbox-delayed', monitor = 'worker') =>
    `select public.record_monitor_observation_v1('${monitor}','99100000-0000-4000-8000-${String(n).padStart(12, '0')}',
      '${new Date(epoch + n * 1000).toISOString()}','${state}',${family === null ? 'null' : `'${family}'`});`;
  assert.equal(sql(record(1)), 'f');
  assert.equal(sql('select count(*) from monitor_history_private.incidents;'), '0');
  for (const role of ['anon', 'authenticated']) {
    assert.equal(sql(`select has_function_privilege('${role}','public.get_monitor_heartbeat_v1()','execute');`), 'f');
    assert.equal(sql(`select has_function_privilege('${role}','public.get_monitor_incident_history_v1(bigint,integer)','execute');`), 'f');
    assert.equal(sql(`select has_function_privilege('${role}','public.record_monitor_observation_v1(text,uuid,timestamptz,text,text)','execute');`), 'f');
    assert.throws(() => sql(`set role ${role};select * from monitor_history_private.incidents;`));
  }
  sql('update monitor_history_private.settings set enabled=true;');
  assert.equal(sql(`set role service_role;${record(1)}`), 't');
  assert.equal(sql(record(1)), 'f');
  assert.throws(() => sql(record(1, 'healthy', null)), /Conflicting monitor replay/);
  assert.equal(sql(record(2)), 't');
  assert.equal(sql('select count(*) from monitor_history_private.incidents;'), '1');
  assert.equal(sql(record(3, 'unavailable', 'operational-health-check-failed')), 't');
  assert.equal(sql("select ended_reason from monitor_history_private.incidents where id=1;"), 'superseded');
  assert.equal(sql(record(4, 'healthy', null)), 't');
  assert.equal(sql("select ended_reason from monitor_history_private.incidents where family='operational-health-check-failed';"), 'recovered');
  assert.equal(sql(record(2)), 'f');
  assert.equal(sql(record(5)), 't');
  const heartbeat = JSON.parse(sql('set role service_role;select public.get_monitor_heartbeat_v1();'));
  assert.equal(heartbeat.enabled, true);
  assert.equal(heartbeat.state, 'degraded');
  assert.equal(Date.parse(heartbeat.observed_at), epoch + 5000);
  assert.deepEqual(Object.keys(heartbeat).sort(), ['checked_at','enabled','observed_at','received_at','state']);
  assert.equal(sql(record(6, 'unavailable', 'monitor-heartbeat-missing', 'watchdog')), 't');
  assert.equal(sql('select count(*) from monitor_history_private.incidents where ended_at is null;'), '2');
  assert.throws(() => sql(record(7, 'degraded', 'private-answer')), /Invalid monitor family/);
  assert.throws(() => sql(record(7, 'healthy', 'domain-outbox-delayed')), /Invalid monitor family/);
  assert.throws(() => sql(record(7, 'degraded', null)), /Invalid monitor family/);
  assert.throws(() => sql(record(7, 'unknown')), /Invalid monitor observation/);
  assert.throws(() => sql(record(7, 'healthy', null, 'arbitrary')), /Invalid monitor observation/);
  for (const time of ["now()+interval '1 minute'", "now()-interval '6 minutes'", "'infinity'::timestamptz", 'null'])
    assert.throws(() => sql(`select public.record_monitor_observation_v1('worker',gen_random_uuid(),${time},'healthy',null);`), /Invalid monitor observation/);
  const page = JSON.parse(sql('select public.get_monitor_incident_history_v1(null,2);'));
  assert.equal(page.incidents.length, 2);
  const next = JSON.parse(sql(`select public.get_monitor_incident_history_v1(${page.incidents[1].id},2);`));
  assert.equal(next.incidents.length, 2);
  assert.ok(next.incidents.every((row: { id: number }) => row.id < page.incidents[1].id));
  for (const limit of [0, 101, null])
    assert.throws(() => sql(`select public.get_monitor_incident_history_v1(null,${limit});`), /Invalid monitor history page/);
  assert.throws(() => sql('select public.get_monitor_incident_history_v1(0,1);'), /Invalid monitor history page/);
  assert.equal(fingerprint(), before, 'Existing functions/grants unchanged');
  sql(source('monitor_incident_history_v1.rollback.sql'));
  assert.equal(sql(record(8, 'healthy', null)), 'f');
  assert.equal(sql('select count(*) from monitor_history_private.incidents;'), '4');
  assert.equal(sql('select count(*) from monitor_history_private.incidents where ended_at is null;'), '2');
  assert.equal(fingerprint(), before, 'Retaining rollback preserves existing contracts');
  return 'Monitor history: disabled gate, service-only writes/reads, replay/order fences, incident transitions, pagination, validation and retaining rollback';
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2);
  const { createCleanRoom } = await import('./clean-room.mts');
  const room = createCleanRoom();
  try { await room.start(); console.log(monitorHistory(room)); }
  finally { room.stop(); }
}
