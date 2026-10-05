// Local-only verification against the schema-only production restore. No cloud
// credentials, real identities, provider calls, or member records are required.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { container, workdir } from './employee-test-runtime.mts';
import { errorOutput, record } from './database/contracts.mts';

const podman = 'C:/Program Files/RedHat/Podman/podman.exe';
function sql(source: string) {
  return execFileSync(
    podman,
    [
      'exec',
      '-i',
      container,
      'psql',
      '-X',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    { input: source, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  ).trim();
}
function query(source: string): Record<string, unknown>[] {
  const rows: unknown = JSON.parse(
    sql(`select coalesce(jsonb_agg(x),'[]'::jsonb) from (${source}) x;`),
  );
  assert.ok(Array.isArray(rows) && rows.every(record), 'Expected SQL snapshot rows');
  return rows;
}
const before =
  query(`select p.oid::regprocedure::text signature, md5(pg_get_functiondef(p.oid)) definition,
  has_function_privilege('authenticated',p.oid,'EXECUTE') member_execute,
  has_function_privilege('anon',p.oid,'EXECUTE') anon_execute
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'
  order by 1`);
const policyQuery = `select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
  from pg_policies where schemaname in ('public','storage')
    and policyname not in ('employee_report_evidence_read','employee_report_evidence_boundary')
  order by schemaname,tablename,policyname`;
const policies = query(policyQuery);
const grantsQuery = `select c.oid::regclass::text relation, c.relrowsecurity, c.relforcerowsecurity,
  r.role, v.privilege, has_table_privilege(r.role,c.oid,v.privilege) allowed
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  cross join (values ('authenticated'),('anon')) r(role)
  cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRIGGER')) v(privilege)
  where n.nspname in ('public','storage') and c.relkind in ('r','p','v','m') order by 1,4,5`;
const grants = query(grantsQuery);
if (process.env.DOJI_ALLOW_SYNTHETIC_FIXTURES === 'true') {
  assert.equal(
    sql("select count(*) from auth.users where email is null or email not like '%@test.invalid';"),
    '0',
    'Only synthetic test identities permitted',
  );
  assert.equal(
    sql('select count(*) from vault.secrets;'),
    '0',
    'No outbound production credentials',
  );
  assert.equal(
    sql(
      "select count(*) from public.admin_employees where status <> 'pending' or cardinality(roles)>0;",
    ),
    '0',
    'No approved employee identities',
  );
} else {
  assert.equal(
    sql('select count(*) from auth.users;'),
    '0',
    'Start with schema only, no identities',
  );
}
assert.equal(
  sql("select to_regclass('public.admin_employee_cutover') is null;"),
  't',
  'Fresh authorization migration required',
);
assert.equal(
  sql("select to_regclass('public.admin_employees') is not null;"),
  't',
  'Install foundation first',
);

const migration = readFileSync(
  resolve(
    process.env.DOJI_TEST_GUARDED_MIGRATION === 'true'
      ? 'test-results/employee-access-release/proposed-authorization.sql'
      : 'docs/drafts/20260926011000_employee_portal_authorization.sql',
  ),
  'utf8',
);
for (const [label, probe] of [
  [
    'unexpected PUBLIC RPC',
    `create function public.employee_test_leak() returns boolean language sql as $$select true$$;
    grant execute on function public.employee_test_leak() to public;`,
  ],
  [
    'changed reviewed helper',
    `create or replace function public.level_from_xp(p_xp integer) returns integer
    language plpgsql immutable as $$begin return 0; end$$;`,
  ],
] as const) {
  let rejected = false;
  try {
    sql(migration.replace('begin;', () => `begin;\n${probe}`));
  } catch (error) {
    assert.match(
      errorOutput(error, 'stderr'),
      /Employee isolation preflight: unexpected RPC access|Employee release stopped: production function drift/,
    );
    rejected = true;
  }
  assert.ok(rejected, label);
  assert.equal(
    sql("select to_regclass('public.admin_employee_cutover') is null;"),
    't',
    'Failure rolled back',
  );
  console.log(`PASS: ${label} rejected with rollback`);
}
sql(migration);
const after =
  query(`select p.oid::regprocedure::text signature, md5(pg_get_functiondef(p.oid)) definition,
  has_function_privilege('authenticated',p.oid,'EXECUTE') member_execute,
  has_function_privilege('anon',p.oid,'EXECUTE') anon_execute
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'
  order by 1`);
const afterMap = new Map(after.map((row) => [row.signature, row]));
const changes = [];
for (const row of before) {
  const next = afterMap.get(row.signature);
  assert.ok(next, `Existing function retained: ${row.signature}`);
  if (row.definition !== next.definition) {
    assert.ok(typeof row.signature === 'string');
    assert.match(
      row.signature,
      /^(get_admin_|trg_enforce_write_rate_limit\(\)$|admin_user_has_permission\(|admin_current_operator_role\(|admin_decide_report_v2_legacy_20260924\(|admin_decide_report_v3\(|admin_review_moderation_appeal_before_account_restrictions_2026\(|admin_set_report_review_state_v1\(|admin_triage_report_before_restricted_guard_20260924\()/,
      `Non-portal function unchanged: ${row.signature}`,
    );
    changes.push(row.signature);
  }
  assert.equal(
    next.member_execute,
    row.member_execute,
    `Member execute preserved: ${row.signature}`,
  );
  assert.equal(next.anon_execute, row.anon_execute, `Anon execute preserved: ${row.signature}`);
}
assert.deepEqual(query(policyQuery), policies, 'Existing member/Storage policies unchanged');
const afterGrants = new Map(
  query(grantsQuery).map((row) => [`${row.relation}:${row.role}:${row.privilege}`, row]),
);
for (const row of grants)
  assert.deepEqual(afterGrants.get(`${row.relation}:${row.role}:${row.privilege}`), row);
assert.equal(
  sql('select employee_only from public.admin_employee_cutover;'),
  'f',
  'Cutover remains off',
);
assert.equal(
  sql("select has_schema_privilege('doji_employee','auth','USAGE');"),
  'f',
  'No direct managed Auth access',
);
assert.equal(
  sql(
    "select has_function_privilege('doji_employee','public.can_read_post_media(text,uuid)','EXECUTE');",
  ),
  'f',
  'No arbitrary-viewer evidence helper',
);
assert.equal(
  sql('set role doji_employee; select count(*) from storage.objects;'),
  'SET\n0',
  'Storage policy works without Auth schema USAGE',
);
const report = {
  localOnly: true,
  testedAt: new Date().toISOString(),
  checks: [
    'full public-schema migration',
    'unexpected PUBLIC grant rollback',
    'reviewed helper drift rollback',
    'member/anon function grants unchanged',
    'non-portal definitions unchanged except approved employee trigger dispatch',
    'existing table grants and RLS unchanged',
    'cutover off',
    'employee storage policy without Auth schema usage',
  ],
  existingFunctionCount: before.length,
  changedPortalFunctions: changes,
  limitations: [
    'Managed local schemas are not a hosted clone.',
    'Synthetic command/Auth and device tests remain required.',
  ],
};
mkdirSync(workdir, { recursive: true });
writeFileSync(
  resolve(workdir, 'migration-verification.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report, null, 2));
