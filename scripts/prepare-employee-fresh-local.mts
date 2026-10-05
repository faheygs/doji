import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const dir = 'test-results/employee-cutover-verify';
if (process.argv[2] === 'prepare') {
  mkdirSync(`${dir}/supabase`, { recursive: true });
  const config = readFileSync(
    'test-results/employee-enrollment-check/supabase/config.toml',
    'utf8',
  );
  assert.ok(config.includes('project_id = "employee-enrollment-check"'));
  writeFileSync(
    `${dir}/supabase/config.toml`,
    config.replace(
      'project_id = "employee-enrollment-check"',
      'project_id = "employee-cutover-verify"',
    ),
  );
  console.log(
    'Prepared fresh unlinked local verification project. No providers or production credentials.',
  );
} else {
  const sql = (s: string) =>
    execFileSync(
      'C:/Program Files/RedHat/Podman/podman.exe',
      [
        'exec',
        '-i',
        'supabase_db_employee-cutover-verify',
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
      { input: s, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim();
  assert.equal(sql('select count(*) from auth.users;'), '0');
  assert.equal(sql('select count(*) from vault.secrets;'), '0');
  assert.equal(sql("select to_regclass('public.profiles') is null;"), 't');
  sql(
    'create extension if not exists pg_trgm with schema extensions; create extension if not exists pg_net with schema extensions; create extension if not exists pg_cron;',
  );
  sql(readFileSync('test-results/employee-sandbox/public-schema.sql', 'utf8'));
  sql(
    readFileSync('supabase/migrations/20260926030000_employee_enrollment_foundation.sql', 'utf8'),
  );
  console.log(
    'Restored public schema and deployed enrollment foundation locally. No member records copied.',
  );
}
