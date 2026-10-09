// Local only: creates an owned, network-disabled test container, never a remote DB.
import assert from 'node:assert/strict';
import { createCleanRoom, installManagedSchemas, replay } from './database/clean-room.mts';
import { source } from './database/integration.mts';
import { announcementComposeConcurrency } from './database/announcement-compose-concurrency.mts';

assert.equal(process.argv.length, 2, 'No targets or connection URLs accepted');
const room = createCleanRoom();
const snapshot = () =>
  room.sql(`select coalesce(jsonb_agg(jsonb_build_object(
  'signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),
  'owner',p.proowner,'acl',p.proacl) order by p.oid),'[]')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','auth') and p.prokind='f'
  and p.proname<>'admin_announcement_compose_v1';`);
try {
  await room.start();
  installManagedSchemas(room);
  const migrations = await replay(room);
  console.log(`PASS: ${migrations.length} migrations replayed in an offline disposable database`);
  const before = snapshot();
  room.sql(source('docs/drafts/employee_announcement_compose_v1.sql'));
  assert.equal(
    snapshot(),
    before,
    'All existing function definitions, owners and grants unchanged',
  );
  room.sql(source('scripts/test-announcement-compose.sql'));
  console.log(
    'PASS: announcement compose permissions, lifecycle, replay, atomic rollback and member checks',
  );
  assert.equal(
    room.sql('select count(*) from public.app_announcements;select count(*) from auth.users;'),
    '0\n0',
  );
  await announcementComposeConcurrency(room);
  const savedData = () =>
    room.sql(`select jsonb_build_object(
    'announcements',(select jsonb_agg(to_jsonb(a) order by id) from public.app_announcements a),
    'state',(select jsonb_agg(to_jsonb(a) order by announcement_id) from public.admin_announcement_state a),
    'audit',(select jsonb_agg(to_jsonb(a) order by id) from public.admin_audit_log a),
    'receipts',(select jsonb_agg(to_jsonb(a) order by user_id,idempotency_key) from public.admin_employee_command_receipts a));`);
  const dataBeforeRollback = savedData();
  room.sql(source('docs/drafts/employee_announcement_compose_v1.rollback.sql'));
  assert.equal(snapshot(), before, 'Rollback preserves every existing function and grant');
  assert.equal(
    room.sql(
      "select to_regprocedure('public.admin_announcement_compose_v1(text,uuid,text,jsonb,uuid)') is null;",
    ),
    't',
  );
  assert.equal(savedData(), dataBeforeRollback);
  console.log(
    'PASS: rollback preserves published records; container cleanup removes synthetic fixtures',
  );
} finally {
  room.stop();
}
