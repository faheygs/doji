// Local, network-disabled disposable database only. No remote target accepted.
import assert from 'node:assert/strict';
import { createCleanRoom, installManagedSchemas, replay } from './database/clean-room.mts';
import { source } from './database/integration.mts';
import { errorOutput } from './database/contracts.mts';
assert.equal(process.argv.length, 2);
const room = createCleanRoom();
const sql = (text: string) =>
  room.sql('set role postgres;set search_path=public,extensions;' + text);
try {
  await room.start();
  installManagedSchemas(room);
  console.log('PASS: ' + (await replay(room)).length + ' migrations replayed offline');
  for (const name of [
    'business_applications_v1',
    'portal_identity_registry_v1',
    'employee_session_store_v1',
    'portal_employee_actors_v1',
    'portal_identity_employee_rpc_v1',
  ])
    sql(source('docs/drafts/' + name + '.sql'));
  const fingerprint = () =>
    sql(`select md5(string_agg(x,'|' order by x)) from (
    select pg_get_functiondef(oid)||coalesce(proacl::text,'') x from pg_proc
    where prokind='f' and pronamespace in ('public'::regnamespace,'auth'::regnamespace,'storage'::regnamespace,'portal_identity_private'::regnamespace)
    and proname not in ('admin_announcement_compose_v1','employee_announcement_rpc_v1')
    union all select to_jsonb(p)::text from pg_policies p
    union all select to_jsonb(u)::text from auth.users u
    union all select to_jsonb(p)::text from public.profiles p) preserved;`);
  const before = fingerprint();
  sql(source('docs/drafts/employee_announcement_compose_v1.sql'));
  sql(source('docs/drafts/employee_announcement_bridge_v1.sql'));
  sql(source('scripts/test-announcement-compose.sql'));
  console.log('PASS: atomic lifecycle, replay, rollback and member eligibility regressions');
  const result = sql(source('scripts/test-announcement-bridge.sql'));
  console.log(
    result
      .split('\n')
      .filter((line) => line.startsWith('PASS:'))
      .join('\n'),
  );
  assert.equal(fingerprint(), before, 'Existing function/grant/policy/member contracts unchanged');
  sql(source('docs/drafts/employee_announcement_bridge_v1.rollback.sql'));
  sql(source('docs/drafts/employee_announcement_compose_v1.rollback.sql'));
  assert.equal(fingerprint(), before);
  console.log('PASS: inverse rollback and unchanged existing/member contracts');
} catch (error) {
  console.error(errorOutput(error, 'stderr'));
  throw error;
} finally {
  room.stop();
}
