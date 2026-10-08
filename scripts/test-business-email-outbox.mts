// Disposable offline PostgreSQL only. No production target, send or provider call.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCleanRoom, installManagedSchemas, replay } from './database/clean-room.mts';
const room = createCleanRoom();
const source = (name: string) => readFileSync(name, 'utf8').replaceAll('\r\n', '\n');
try {
  await room.start();
  installManagedSchemas(room);
  await replay(room);
  const overlays = ['business_applications_v1', 'portal_identity_registry_v1'];
  for (const name of overlays)
    room.sql('set role postgres;\n' + source('docs/drafts/' + name + '.sql'));
  const contracts = () =>
    room.sql(`select jsonb_agg(jsonb_build_object('oid',p.oid,'definition',pg_get_functiondef(p.oid),'acl',p.proacl) order by p.oid)
    from pg_proc p where p.pronamespace in ('public'::regnamespace,'auth'::regnamespace) and p.prokind='f';
    select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p;
    select jsonb_agg(jsonb_build_object('id',oid,'acl',relacl,'rls',relrowsecurity) order by oid) from pg_class
    where relnamespace in ('public'::regnamespace,'auth'::regnamespace,'storage'::regnamespace);`);
  const before = contracts();
  room.sql('set role postgres;\n' + source('docs/drafts/business_email_outbox_v1.sql'));
  const output = room.sql(
    'set role postgres;\n' + source('scripts/test-business-email-outbox.sql'),
  );
  const checks = output.split('\n').filter((line) => line.startsWith('PASS:'));
  assert.ok(checks.length >= 20);
  console.log(checks.join('\n'));
  room.sql('set role postgres;\n' + source('docs/drafts/business_email_outbox_v1.rollback.sql'));
  assert.equal(
    room.sql('select capture_enabled or sending_enabled from business_private.email_settings'),
    'f',
  );
  assert.equal(
    room.sql(
      "select has_function_privilege('doji_business_mail','business_private.claim_application_email()','execute')",
    ),
    'f',
  );
  assert.ok(Number(room.sql('select count(*) from business_private.email_outbox')) > 0);
  assert.equal(contracts(), before);
  console.log(
    'PASS: existing public/Auth RPCs, grants, all RLS policies and member table permissions unchanged.',
  );
  console.log(
    'PASS: rollback disables producers/claimers, retains evidence; owned offline container removed.',
  );
} finally {
  room.stop();
}
