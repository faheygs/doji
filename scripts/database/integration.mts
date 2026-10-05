import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyTap } from './tap.mts';
import type { TestRoom } from './contracts.mts';
import { errorOutput, message } from './contracts.mts';
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));

export const source = (path: string) =>
  readFileSync(resolve(root, path), 'utf8').replaceAll('\r\n', '\n');
export const member = '91000000-0000-4000-8000-000000000001';
export const other = '91000000-0000-4000-8000-000000000002';
export const staff = '91000000-0000-4000-8000-000000000003';
export const quote = (value: string) => `'${String(value).replaceAll("'", "''")}'`;
export const claims = (id: string, role = 'authenticated', aal = 'aal1') =>
  `set local request.jwt.claims=${quote(JSON.stringify({ sub: id, role, aal }))};set local role ${role};`;

export async function integration(room: TestRoom) {
  const results: string[] = [];
  const failures: string[] = [];
  const pass = (name: string) => {
    results.push(name);
    console.log(`PASS: ${name}`);
  };
  const test = (name: string, sql: string) => {
    try {
      room.sql(sql);
      pass(name);
      return true;
    } catch (error) {
      const detail = `${name}: ${errorOutput(error, 'stderr')}`;
      failures.push(detail);
      console.error(detail);
      return false;
    }
  };
  const install = (name: string) => {
    if (!test(`Install ${name} locally`, source(`docs/drafts/${name}.sql`)))
      throw Error(`Required schema overlay failed: ${name}`);
  };
  const batch = (name: string, files: string[]) =>
    test(
      name,
      `begin;set local statement_timeout='15s';
    ${files.map(source).join('\n')}\nreset role;rollback;`,
    );

  assert.equal(
    room.sql('select count(*) from auth.users;select count(*) from vault.secrets;'),
    '0\n0',
  );
  room.sql(`insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data) values
    ('${member}','authenticated','authenticated','member-one@test.invalid',now(),'{}'),
    ('${other}','authenticated','authenticated','member-two@test.invalid',now(),'{}');
    insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
    ('${staff}','authenticated','doji_employee','staff@test.invalid',now(),'{"account_type":"employee"}','{}');
    insert into public.admin_employees(id,display_name,status,roles) values
    ('${staff}','Synthetic test employee','active',array['super_admin']);
    update public.admin_employee_cutover set employee_only=true;`);
  const baseline = room.sql(
    "select md5(string_agg(to_jsonb(u)::text,',' order by id)) from auth.users u;",
  );

  const { announcementPermissions } = await import('./announcement-permissions.mts');
  results.push(...announcementPermissions(room));

  const { extended } = await import('./extended.mts');
  const extendedResults = extended(room);
  for (const item of extendedResults) {
    if (item.status === 'passed') results.push(item.suite);
    else failures.push(`${item.suite}: ${item.output}`);
  }

  room.sql('create extension if not exists pgtap with schema extensions;');
  for (const file of [
    'authoritative_realtime.sql',
    'moderation_policy_workflow.sql',
    'admin_portal_read.sql',
  ]) {
    const output = room.sql(
      `set search_path=public,extensions;${source(`supabase/tests/${file}`)}`,
    );
    try {
      pass(`pgTAP ${file}: ${verifyTap(output)} assertions`);
    } catch (error) {
      failures.push(`${file}: ${message(error)}`);
      console.error(`${file}: ${message(error)}`);
    }
  }
  test(
    'Member report replay and atomic quarantine',
    source('scripts/test-member-report-local.sql'),
  );
  batch('Editorial and campaigns', [
    'scripts/test-editorial-local.sql',
    'scripts/test-announcement-campaigns.sql',
  ]);
  // The editorial test deliberately ends as an AAL1 employee. Fixture inserts
  // for the next suite must return to the local test administrator first.
  test(
    'Reversible ideas',
    `begin;set local statement_timeout='15s';
    ${source('scripts/test-editorial-local.sql')}\nreset role;
    ${source('scripts/test-idea-retriage.sql')}\nreset role;rollback;`,
  );
  install('business_applications_v1');
  batch('Business RLS and application lifecycle', ['scripts/test-business-foundation.sql']);
  install('portal_identity_registry_v1');
  batch('Independent realms and session revocation', ['scripts/test-portal-identity-registry.sql']);
  assert.equal(
    room.sql("select md5(string_agg(to_jsonb(u)::text,',' order by id)) from auth.users u;"),
    baseline,
    'Rollback suites preserve all original Auth identities',
  );
  assert.equal(room.sql('select count(*) from vault.secrets;'), '0');
  pass('Rollback preserves identity state; no outbound credentials');
  return { passed: results, failures, extended: extendedResults };
}
