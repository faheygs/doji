import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyTap } from './tap.mts';
import type { TestRoom } from './contracts.mts';
const root = resolve(import.meta.dirname, '../..');
export function workflowHealth(room: TestRoom) {
  const source = (path: string) => readFileSync(resolve(root, path), 'utf8');
  const sql = (source: string) => room.sql(`set role postgres;${source}`);
  room.inspect();
  room.sql('create extension if not exists pg_cron;create extension if not exists pgtap with schema extensions;');
  const fingerprint = () => room.sql(`select md5(coalesce(string_agg(pg_get_functiondef(oid)||coalesce(proacl::text,''),'|' order by oid),''))
    from pg_proc where prokind='f' and pronamespace='public'::regnamespace
    and proname not in ('record_workflow_health_v1','get_workflow_health_v1','run_scheduler_log_retention_v1');`);
  const before = fingerprint();
  sql(source('supabase/overlays/workflow_health_v1.sql'));
  const assertions = verifyTap(sql(source('supabase/tests/workflow_health.sql')));
  assert.equal(fingerprint(), before, 'Existing member functions and grants are unchanged');
  sql(`update workflow_health_private.settings set observations_enabled=true,scheduler_retention_enabled=true;
    select public.record_workflow_health_v1('activate','succeeded','command',1);`);
  sql(source('supabase/overlays/workflow_health_v1.rollback.sql'));
  assert.equal(room.sql("select public.record_workflow_health_v1('activate','succeeded','command',1);"), 'f');
  assert.equal(room.sql("select public.run_scheduler_log_retention_v1()->>'enabled';"), 'false');
  assert.equal(room.sql('select count(*) from workflow_health_private.receipts;'), '1');
  assert.equal(fingerprint(), before, 'Rollback preserves existing functions and grants');
  return `Workflow health: ${assertions} assertions; rollback disables writes and retains receipts`;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, 'Only the owned offline clean room is accepted');
  const { createCleanRoom } = await import('./clean-room.mts');
  const room = createCleanRoom();
  try { await room.start(); console.log(workflowHealth(room)); }
  finally { room.stop(); }
}
