// Offline PostgreSQL only. No provider, credentials, email or production target.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCleanRoom, installManagedSchemas, replay } from './database/clean-room.mts';
import { setupConcurrency } from './database/business-setup-concurrency.mts';
const room = createCleanRoom();
const source = (name: string) => readFileSync(name, 'utf8').replaceAll('\r\n', '\n');
try {
  await room.start();
  installManagedSchemas(room);
  await replay(room);
  for (const name of [
    'business_applications_v1',
    'business_auth_v1',
    'business_signup_legal_v1',
    'business_privacy_v1',
    'portal_identity_registry_v1',
    'portal_identity_business_enrollment_v1',
    'portal_identity_business_reads_v1',
    'portal_identity_business_commands_v1',
    'portal_identity_business_review_v1',
    'business_session_store_v1',
    'portal_identity_business_privacy_v1',
  ])
    room.sql('set role postgres;\n' + source('docs/drafts/' + name + '.sql'));
  const contracts = () =>
    room.sql(`select jsonb_agg(jsonb_build_array(oid,pg_get_functiondef(oid),proacl) order by oid)
    from pg_proc where pronamespace in ('public'::regnamespace,'auth'::regnamespace) and prokind='f';
    select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p;
    select jsonb_agg(to_jsonb(u) order by id) from auth.users u;
    select jsonb_agg(to_jsonb(p) order by id) from public.profiles p;`);
  const before = contracts();
  room.sql('set role postgres;\n' + source('docs/drafts/business_setup_v1.sql'));
  room.sql('set role postgres;\n' + source('docs/drafts/business_setup_privacy_v1.sql'));
  const output = room.sql(
    'set role postgres;\n' +
      source('scripts/test-business-setup.sql') +
      '\n' +
      source('scripts/test-business-setup-privacy.sql'),
  );
  const checks = output.split('\n').filter((line) => line.startsWith('PASS:'));
  assert.ok(checks.length >= 20);
  console.log(checks.join('\n'));
  await setupConcurrency(room);
  room.sql('set role postgres;\n' + source('docs/drafts/business_setup_v1.rollback.sql'));
  assert.equal(room.sql('select enabled from business_private.setup_settings'), 'f');
  assert.equal(room.sql('select count(*) from business_private.brand_profiles'), '1');
  assert.equal(contracts(), before);
  console.log(
    'PASS: retaining rollback; public/member/Auth functions, grants, policies and rows unchanged',
  );
} finally {
  room.stop();
}
