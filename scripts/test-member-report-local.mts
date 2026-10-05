// Hard-coded local container only; no hosted URL, project ID or credential accepted.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const podman = 'C:/Program Files/RedHat/Podman/podman.exe';
const container = 'supabase_db_employee-cutover-verify';
const args = [
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
];
const stateSql = `select jsonb_build_object(
  'users', (select count(*) from auth.users),
  'profiles', (select count(*) from public.profiles),
  'reports', (select count(*) from public.reports),
  'receipts', (select count(*) from public.command_receipts),
  'function_contracts', (select md5(string_agg(pg_get_functiondef(p.oid), '' order by p.oid))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f'));`;
const sql = (input: string) =>
  execFileSync(podman, args, { input, encoding: 'utf8', timeout: 30_000 });
const before = sql(stateSql).trim();
try {
  console.log(
    sql(readFileSync(new URL('./test-member-report-local.sql', import.meta.url), 'utf8')).trim(),
  );
} finally {
  assert.equal(
    sql(stateSql).trim(),
    before,
    'Local persistent counts and function definitions must remain unchanged',
  );
}
console.log(
  'PASS: rollback preserved local user/profile/report/receipt counts and function definitions',
);
