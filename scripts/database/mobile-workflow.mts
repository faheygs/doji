import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestRoom } from './contracts.mts';
export function mobileWorkflow(room: TestRoom) {
  room.inspect();
  const sql = (text: string) => room.sql(`set role postgres;${text}`);
  const source = (name: string) =>
    readFileSync(new URL(`../../supabase/overlays/${name}`, import.meta.url), 'utf8');
  const fingerprint = () =>
    sql(
      `select md5(coalesce(string_agg(pg_get_functiondef(oid)||coalesce(proacl::text,''),'|' order by oid),'')) from pg_proc where prokind='f' and pronamespace='public'::regnamespace and proname not in('record_mobile_workflow_counts_v1','get_mobile_workflow_counts_v1');`,
    );
  const before = fingerprint();
  sql(source('mobile_workflow_counts_v1.sql'));
  const batch = {
    id: 'wf:synthetic-batch-0001',
    issuedAt: Date.now(),
    platform: 'ios',
    rows: [{ phase: 'submit', outcome: 'confirmed', count: 3, capped: false }],
  };
  const actor = '99100000-0000-4000-8000-000000000001';
  const call = (value: unknown = batch, id = actor) =>
    `select public.record_mobile_workflow_counts_v1('${id}','${JSON.stringify(value).replaceAll("'", "''")}');`;
  assert.equal(sql(call()), 'disabled');
  for (const role of ['anon', 'authenticated']) {
    assert.throws(() => sql(`set role ${role};${call()}`));
    assert.throws(() => sql(`set role ${role};select public.get_mobile_workflow_counts_v1();`));
    assert.throws(() => sql(`set role ${role};select * from mobile_workflow_private.hours;`));
  }
  sql('update mobile_workflow_private.settings set enabled=true;');
  assert.equal(sql(`set role service_role;${call()}`), 'accepted');
  assert.equal(sql(call()), 'duplicate');
  assert.equal(sql(call({ ...batch, id: 'wf:synthetic-batch-0002' })), 'limited');
  assert.equal(sql('select sum(count) from mobile_workflow_private.hours;'), '3');
  for (const value of [
    null,
    {},
    { ...batch, private: 'x' },
    { ...batch, platform: null },
    { ...batch, issuedAt: Date.now() - 300001 },
    { ...batch, rows: [...batch.rows, ...batch.rows] },
    ...[
      { phase: null },
      { outcome: null },
      { count: 0 },
      { count: 15001 },
      { count: 1.5 },
      { private: 'answer' },
      { phase: 'feed' },
    ].map((patch) => ({ ...batch, rows: [{ ...batch.rows[0], ...patch }] })),
  ])
    assert.throws(() => sql(call(value)), JSON.stringify(value));
  const read = JSON.parse(
    sql('set role service_role;select public.get_mobile_workflow_counts_v1();'),
  );
  assert.equal(read.source, 'device_reported');
  assert.equal(read.rows.length, 1);
  assert.equal(read.rows[0].count, 3);
  assert.equal(JSON.stringify(read).includes(actor), false);
  assert.equal(JSON.stringify(read).includes(batch.id), false);
  sql("update mobile_workflow_private.admission set accepted_at=now()-interval '16 minutes';");
  assert.equal(sql(call({ ...batch, id: 'wf:synthetic-batch-0002' })), 'accepted');
  assert.equal(sql('select sum(count) from mobile_workflow_private.hours;'), '6');
  assert.equal(fingerprint(), before);
  sql(source('mobile_workflow_counts_v1.rollback.sql'));
  assert.equal(sql(call()), 'disabled');
  assert.equal(sql('select sum(count) from mobile_workflow_private.hours;'), '6');
  assert.throws(() => sql(`set role service_role;${call()}`));
  assert.equal(fingerprint(), before);
  return 'Device counts: bounded admission, strict payload, replay/rate fences, private projection, unchanged existing contracts and retaining rollback';
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2);
  const { createCleanRoom } = await import('./clean-room.mts');
  const room = createCleanRoom();
  try {
    await room.start();
    console.log(mobileWorkflow(room));
  } finally {
    room.stop();
  }
}
