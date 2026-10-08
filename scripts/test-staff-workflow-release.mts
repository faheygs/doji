// Production-shaped assembly exercised only in an owned network-disabled database.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCleanRoom, installManagedSchemas, replay } from './database/clean-room.mts';
import {
  body,
  withoutBlockingIndex,
  guardedInstall,
  contractHash,
  indexStatements,
} from './staff-workflow-release-guards.mts';
assert.equal(process.argv.length, 2);
const room = createCleanRoom();
const read = (name: string) => readFileSync(`docs/drafts/${name}.sql`, 'utf8');
try {
  await room.start();
  installManagedSchemas(room);
  await replay(room);
  const sql = (text: string) =>
    room.sql('set role postgres;set search_path=public,extensions;' + text);
  for (const name of [
    'business_applications_v1',
    'portal_identity_registry_v1',
    'employee_session_store_v1',
    'portal_employee_actors_v1',
    'portal_identity_employee_rpc_v1',
    'business_privacy_v1',
    'external_takedown_intake_v1',
  ])
    sql(read(name));
  const before = sql(contractHash);
  const parts = [
    'staff_case_ownership_v1',
    'staff_workflow_extended_v1',
    'staff_workflow_events_v1',
    'staff_workflow_employee_bridge_v1',
  ].map((name) =>
    name === 'staff_case_ownership_v1' ? withoutBlockingIndex(body(read(name))) : body(read(name)),
  );
  const install = guardedInstall(parts.join('\n'), before);
  // The guard rejects stale baselines before any additive object is retained.
  assert.throws(() => sql(guardedInstall(parts.join('\n'), '0'.repeat(32))));
  assert.equal(sql("select to_regnamespace('staff_workflow_private') is null;"), 't');
  sql(install);
  assert.equal(sql(contractHash), before);
  assert.equal(
    sql(
      'select enabled or extended_enabled or events_enabled from staff_workflow_private.settings;',
    ),
    'f',
  );
  assert.throws(() => sql(install));
  // One statement per round trip, same shape used by the existing release API.
  for (const statement of indexStatements) room.sql(statement);
  assert.equal(
    sql(
      "select count(*) from pg_index i join pg_class c on c.oid=i.indexrelid where c.relname in('staff_business_pending_page_idx','staff_business_open_page_idx','staff_intake_open_page_idx','staff_privacy_open_page_idx') and i.indisvalid and i.indisready;",
    ),
    '4',
  );
  for (const name of [
    'staff_workflow_employee_bridge_v1.rollback',
    'staff_workflow_extended_v1.rollback',
    'staff_case_ownership_v1.rollback',
  ])
    sql(read(name));
  assert.equal(sql(contractHash), before);
  assert.equal(sql("select count(*) from pg_trigger where tgname like 'staff_workflow_%';"), '0');
  assert.equal(
    sql(
      "select has_function_privilege('doji_employee_application','portal_identity_private.employee_workflow_rpc_v1(text,text,text,text,boolean,text,jsonb)','execute');",
    ),
    'f',
  );
  console.log(
    'PASS: exact guarded assembly, stale/duplicate denial, default-off gates, four separate concurrent indexes and retaining rollback; existing contracts unchanged.',
  );
} finally {
  room.stop();
}
