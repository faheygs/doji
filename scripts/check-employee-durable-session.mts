// Focused release check of the NEW durable adapter, not a broad regression run.
// Uses only a disposable database in the existing network-disabled local container.
import { execFile, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createEmployeeSessionStore } from '../infra/portal-identity-candidate/employee-session-store.mts';
import { engine as podman, container } from './database/owned-target.mts';
import { offlineContainer } from './database/contracts.mts';
import { present } from './employee-test-fixtures.mts';
import type {
  StoreExecute,
  EmployeeStoreConfig,
} from '../infra/portal-identity-candidate/employee-session-store.mts';
const inspected = offlineContainer(
  JSON.parse(execFileSync(podman, ['inspect', container], { encoding: 'utf8' })),
);
assert.equal(inspected.HostConfig.NetworkMode, 'none');
assert.equal(Object.keys(inspected.HostConfig.PortBindings || {}).length, 0);
const db = `employee_session_qa_${Date.now()}`;
assert.match(db, /^employee_session_qa_[0-9]+$/);
const args = (database: string) => [
  'exec',
  '-i',
  container,
  'psql',
  '-X',
  '-qAt',
  '-U',
  'postgres',
  '-d',
  database,
  '-v',
  'ON_ERROR_STOP=1',
];
const sync = (sql: string, database = db) =>
  execFileSync(podman, args(database), {
    input: sql,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
const sqlString = (value: string | number | null) =>
  value === null
    ? 'null'
    : typeof value === 'number'
      ? String(value)
      : "'" + value.replaceAll("'", "''") + "'";
const execute: StoreExecute = (role, sql, params, signal) => {
  assert.ok(['doji_employee_session'].includes(role));
  assert.equal(
    sql,
    role === 'doji_employee_session'
      ? 'select employee_session_private.execute_store($1,$2,$3,$4,$5,$6::integer,$7,$8) as result'
      : 'select employee_session_private.reserve_registration($1,$2,$3) as result',
  );
  signal?.throwIfAborted();
  // Test-only psql transport. Production must use a restricted parameterized driver.
  return new Promise((resolve, reject) => {
    const child = execFile(
      podman,
      args(db),
      { encoding: 'utf8', signal, timeout: 6000 },
      (error, stdout, stderr) => {
        if (error) {
          console.error('Synthetic SQL diagnostic:', stderr.trim());
          reject(Error('Local session SQL failed'));
        } else {
          try {
            resolve(JSON.parse(stdout.trim()));
          } catch {
            reject(Error('Invalid local result'));
          }
        }
      },
    );
    present(child.stdin ?? undefined).end(
      "begin;set local statement_timeout='3s';set local lock_timeout='1s';set local role " +
        role +
        ';select to_json(result) from (' +
        sql.replace(/\$(\d+)/g, (_: string, n: string) =>
          sqlString(present(params[Number(n) - 1])),
        ) +
        ') as checked;commit;',
    );
  });
};
const cfg: EmployeeStoreConfig = {
  enabled: true,
  realm: 'employee',
  origin: 'https://admin.test',
  clientId: 'client_employee',
};
const scope = createHash('sha256').update(`${cfg.origin}|${cfg.clientId}`).digest('hex');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const envelope = 'A'.repeat(64),
  changed = 'B'.repeat(64);
let created = false,
  roleCreated = false,
  checks = 0;
const pass = (message: string) => {
  checks++;
  console.log('PASS: ' + message);
};
try {
  assert.equal(
    sync(
      "select count(*) from pg_roles where rolname in('doji_employee_session');select count(*) from vault.secrets;select count(*) from auth.users where email is null or email not like '%@test.invalid';",
      'postgres',
    ),
    '0\n0\n0',
  );
  // The session store is self-contained. Do not clone an active database with
  // pg_net/cron background sessions; verify the real baseline separately below.
  sync(`create database ${db} template template0;`, 'postgres');
  created = true;
  const fingerprintSql =
    "select md5(string_agg(p.oid::text||pg_get_functiondef(p.oid)||coalesce(p.proacl::text,''),'' order by p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','auth','business_private') and p.prokind='f';";
  const before = sync(fingerprintSql, 'postgres');
  sync(readFileSync('docs/drafts/employee_session_store_v1.sql', 'utf8'));
  roleCreated = true;
  sync('grant doji_employee_session to postgres;'); // Local harness only; removed with this run's role.
  const store = createEmployeeSessionStore(cfg, execute);
  await assert.rejects(store.putFlow(hash('disabled'), envelope, Date.now() + 5000));
  pass('store defaults off');
  sync(`update employee_session_private.settings set enabled=true,scope_hash='${scope}';`);
  await assert.rejects(
    createEmployeeSessionStore({ ...cfg, clientId: 'client_other' }, execute).putFlow(
      hash('wrong-scope'),
      envelope,
      Date.now() + 5000,
    ),
  );
  pass('other origin or client scope cannot use store');
  await store.putFlow(hash('flow'), envelope, Date.now() + 300000);
  assert.equal(await store.consumeFlow(hash('flow'), () => false), null);
  const consumed = await Promise.all([
    store.consumeFlow(hash('flow'), () => true),
    store.consumeFlow(hash('flow'), () => true),
  ]);
  assert.equal(consumed.filter(Boolean).length, 1);
  pass('wrong binding preserves flow and concurrent consume has one winner');
  await store.putSession(hash('restart'), envelope, Date.now() + 60000);
  const second = createEmployeeSessionStore(cfg, execute);
  await second.withSession(hash('restart'), async (cell) => {
    assert.equal(cell.value, envelope);
  });
  pass('separate adapter instance reads persisted session');
  let release: () => void = () => assert.fail('Uninitialized lease release'),
    started: () => void = () => assert.fail('Uninitialized lease signal');
  const held = new Promise<void>((r) => {
    release = r;
  });
  const ready = new Promise<void>((r) => {
    started = r;
  });
  const first = store.withSession(hash('restart'), async (cell) => {
    started();
    await held;
    assert.notEqual(cell.value, null);
    if (cell.value === null) throw Error('Expected held session');
    await cell.replace(changed);
  });
  await ready;
  await assert.rejects(
    second.withSession(hash('restart'), () => assert.fail('must not enter')),
    { status: 409 },
  );
  assert.equal(
    sync(
      `select count(*) from pg_stat_activity where datname='${db}' and state='idle in transaction';`,
    ),
    '0',
  );
  release();
  await first;
  await second.withSession(hash('restart'), async (cell) => assert.equal(cell.value, changed));
  pass('concurrent instance is fenced without an open DB transaction');
  await assert.rejects(
    store.withSession(hash('restart'), () => {
      throw Object.assign(Error('stale'), { status: 409 });
    }),
    { status: 409 },
  );
  await second.withSession(hash('restart'), async (cell) => assert.equal(cell.value, changed));
  pass('ordinary stale-record rejection preserves the login');
  await store.withSession(hash('restart'), async (cell) => {
    assert.notEqual(cell.value, null);
    if (cell.value === null) throw Error('Expected held session');
    await cell.remove();
    await assert.rejects(cell.replace(envelope));
  });
  await second.withSession(hash('restart'), async (cell) => assert.equal(cell.value, null));
  pass('logout persists and cannot be undone by a late replace');
  await store.putSession(hash('crash'), envelope, Date.now() + 60000);
  sync(
    `update employee_session_private.records set lease_hash='${hash('crashed-owner')}',lease_until=clock_timestamp()-interval '1 second' where key_hash='${hash('crash')}';`,
  );
  await second.withSession(hash('crash'), async (cell) => assert.equal(cell.value, null));
  pass('expired crash lease requires sign-in rather than refresh takeover');
  await store.putFlow(hash('expired'), envelope, Date.now() + 5000);
  sync(
    `update employee_session_private.records set expires_at=clock_timestamp()-interval '1 second' where key_hash='${hash('expired')}';`,
  );
  assert.equal(await store.consumeFlow(hash('expired'), () => true), null);
  pass('server expiry denies and removes old flow');
  sync('update employee_session_private.settings set flow_limit=1;');
  await store.putFlow(hash('capacity'), envelope, Date.now() + 5000);
  await assert.rejects(store.putFlow(hash('overflow'), envelope, Date.now() + 5000), {
    status: 429,
  });
  sync('update employee_session_private.settings set flow_limit=100;');
  pass('durable capacity is enforced');
  assert.equal(
    sync(
      "select has_schema_privilege('authenticated','employee_session_private','usage');select has_table_privilege('doji_employee_session','employee_session_private.records','select,insert,update,delete');select has_function_privilege('authenticated','employee_session_private.execute_store(text,text,text,text,text,integer,text,text)','execute');select pg_has_role('authenticator','doji_employee_session','member');",
    ),
    'f\nf\nf\nf',
  );
  pass('no member API, table access or authenticator membership');

  await store.putSession(hash('freeze'), envelope, Date.now() + 60000);
  sync(readFileSync('docs/drafts/employee_session_store_v1.rollback.sql', 'utf8'));
  await assert.rejects(store.withSession(hash('freeze'), () => assert.fail('frozen')));
  sync(
    'update employee_session_private.settings set enabled=true;grant execute on function employee_session_private.execute_store(text,text,text,text,text,integer,text,text) to doji_employee_session;',
  );
  await second.withSession(hash('freeze'), async (cell) => assert.equal(cell.value, null));
  assert.equal(sync(fingerprintSql, 'postgres'), before);
  pass('rollback invalidates prior sessions and existing function contracts remain unchanged');
  console.log(`${checks} focused durable-session checks passed; synthetic local database only.`);
} finally {
  if (created) {
    sync(`drop database ${db};`, 'postgres');
    console.log('Removed only this run’s temporary database; restored baseline retained.');
  }
  if (roleCreated) sync('drop role doji_employee_session;', 'postgres');
}
