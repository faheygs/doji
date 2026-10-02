// A fresh local clone only; never points at hosted Postgres. No ports/network.
import { execFileSync, execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const podman = 'C:/Program Files/RedHat/Podman/podman.exe';
const container = 'supabase_db_employee-cutover-verify';
const info = JSON.parse(execFileSync(podman, ['inspect', container], { encoding: 'utf8' }))[0];
assert.equal(info.HostConfig.NetworkMode, 'none');
assert.equal(Object.keys(info.HostConfig.PortBindings || {}).length, 0);
const db = `editorial_qa_${Date.now()}`;
assert.match(db, /^editorial_qa_[0-9]+$/);
const args = (database) => [
  'exec',
  '-i',
  container,
  'psql',
  '-X',
  '-U',
  'postgres',
  '-d',
  database,
  '-At',
  '-v',
  'ON_ERROR_STOP=1',
];
const sync = (sql, database = db) =>
  execFileSync(podman, args(database), {
    input: sql,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
const asyncQuery = (sql) =>
  new Promise((resolve) => {
    const proc = execFile(
      podman,
      args(db),
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => resolve({ error, stdout, stderr }),
    );
    proc.stdin.end(sql);
  });
let created = false;
try {
  const guard = sync(
    "select count(*) from auth.users where email is null or email not like '%@test.invalid'; select count(*) from vault.secrets;",
    'postgres',
  ).trim();
  assert.equal(guard, '0\n0');
  sync(`create database ${db} template postgres;`, 'postgres');
  created = true;
  sync(readFileSync('docs/drafts/employee_editorial_v1.sql', 'utf8'));
  // The same qualified fixtures/tests leave a known reviewed record; only in this disposable clone.
  sync(`begin;${readFileSync('scripts/test-editorial-local.sql', 'utf8')}reset role;commit;`);
  const employee = sync('select id from public.admin_employees limit 1;').trim();
  const claims = JSON.stringify({ sub: employee, role: 'doji_employee', aal: 'aal2' });
  const prefix = `begin;set local lock_timeout='5s';set local statement_timeout='8s';select set_config('request.jwt.claims','${claims}',true);set local role doji_employee;`;
  const input = JSON.stringify({
    title: 'Concurrent synthetic draft',
    body: 'No member delivery in this offline test.',
    starts_at: '2026-10-01T10:00:00Z',
    ends_at: '2026-10-02T10:00:00Z',
    priority: 0,
    max_impressions_per_user: 1,
    min_hours_between_impressions: 24,
  });
  const create = `select public.admin_editorial_command_v1('announcements','create',null,null,'${input}','Concurrent create test','concurrent-create-retry');`;
  const retries = await Promise.all([
    asyncQuery(`${prefix}${create}select pg_sleep(0.4);commit;`),
    asyncQuery(`${prefix}${create}commit;`),
  ]);
  for (const result of retries) assert.equal(result.error, null, result.stderr);
  assert.equal(
    sync(
      "select count(*) from public.app_announcements where title='Concurrent synthetic draft';",
    ).trim(),
    '1',
  );
  assert.equal(
    sync(
      "select count(*) from public.admin_audit_log where request_id='concurrent-create-retry';",
    ).trim(),
    '1',
  );
  console.log('PASS: simultaneous identical requests commit one draft and one audit event');
  const row = JSON.parse(
    sync(
      `select result->'result' from public.admin_employee_command_receipts where idempotency_key='concurrent-create-retry';`,
    ).trim(),
  );
  const command = (action) =>
    `select public.admin_editorial_command_v1('announcements','${action}','${row.id}','${row.version}','{}','Conflicting review test','concurrent-${action}-key');`;
  const conflicts = await Promise.all([
    asyncQuery(`${prefix}${command('publish')}select pg_sleep(0.4);commit;`),
    asyncQuery(`${prefix}${command('cancel')}commit;`),
  ]);
  assert.equal(conflicts.filter((result) => !result.error).length, 1, JSON.stringify(conflicts));
  assert.ok(conflicts.some((result) => result.stderr.includes('Item changed')));
  console.log(
    'PASS: concurrent publish/cancel commits one decision and rejects the stale decision',
  );
  // Confirm revocation wins when it is committed before the pending write obtains the employee lock.
  const held = execFile(podman, args(db), { encoding: 'utf8' });
  let resolveLocked;
  const locked = new Promise((resolve) => {
    resolveLocked = resolve;
  });
  held.stdout.on('data', (data) => {
    if (data.includes('employee_locked')) resolveLocked();
  });
  const heldDone = new Promise((resolve, reject) => {
    held.on('error', reject);
    held.on('exit', (code) =>
      code === 0 ? resolve() : reject(Error('Revocation fixture failed')),
    );
  });
  held.stdin.end(
    `begin;update public.admin_employees set status='disabled' where id='${employee}';\n\\echo employee_locked\nselect pg_sleep(1);commit;`,
  );
  await locked;
  const denied = await asyncQuery(`${prefix}${create}commit;`);
  await heldDone;
  assert.ok(denied.error && denied.stderr.includes('Editorial permission required'), denied.stderr);
  console.log('PASS: revocation race denies a write after waiting for employee lock');
} catch (error) {
  console.error(error.stderr?.toString() || error.stack);
  process.exitCode = 1;
} finally {
  if (created) {
    // Exact generated database, created by this run, on the guarded offline container only.
    sync(`drop database ${db};`, 'postgres');
    console.log(
      'Removed this run’s disposable local QA database; original local fixtures untouched.',
    );
  }
}
