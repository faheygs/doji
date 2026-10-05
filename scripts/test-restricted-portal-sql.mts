import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRestrictedSql,
  type RestrictedSqlConfig,
  type PortalSqlClient,
} from '../infra/portal-identity-candidate/restricted-sql.mts';
import type { ClientConfig } from 'pg';
import type { SqlParameter } from '../infra/portal-identity-candidate/employee-contracts.mts';
import { present, testRecord } from './employee-test-fixtures.mts';
type QueryInput = Parameters<PortalSqlClient['query']>[0];
const config: RestrictedSqlConfig = {
  realm: 'employee',
  host: 'aws-0-test.pooler.supabase.com',
  projectRef: 'a'.repeat(20),
  port: 6543,
  database: 'postgres',
  username: 'doji_employee_portal_login.' + 'a'.repeat(20),
  password: 'not-a-real-password-'.repeat(3),
};
const sql =
  'select employee_session_private.execute_store($1,$2,$3,$4,$5,$6::integer,$7,$8) as result';
const params = ['a'.repeat(64), 'put', 'flow', 'b'.repeat(64), 'C'.repeat(64), 1000, null, null];
function fixture(
  overrides: {
    connect?: () => Promise<void>;
    query?: (text: QueryInput, values?: SqlParameter[]) => Promise<void>;
    identity?: Record<string, unknown>;
  } = {},
) {
  const calls: { text: QueryInput; values?: SqlParameter[] }[] = [];
  let clients = 0,
    ends = 0;
  const execute = createRestrictedSql(config, (options) => {
    clients++;
    assert.equal(testRecord(options.ssl).rejectUnauthorized, true);
    assert.equal(options.statement_timeout, 3000);
    return {
      async connect() {
        if (overrides.connect) await overrides.connect();
      },
      async end() {
        ends++;
      },
      async query(text: QueryInput, values?: SqlParameter[]) {
        calls.push({ text, values });
        if (overrides.query) await overrides.query(text, values);
        if (typeof text === 'string' && text.startsWith('begin isolation'))
          return [
            {},
            {},
            {},
            {},
            {
              rows: [
                {
                  login: 'doji_employee_portal_login',
                  current_role: 'doji_employee_portal_login',
                  privileged: false,
                  inherits: false,
                  permitted: true,
                  ...overrides.identity,
                },
              ],
            },
          ];
        return typeof text === 'object' ? { rows: [{ result: { state: 'ok' } }] } : { rows: [] };
      },
    };
  });
  return {
    execute,
    calls,
    clients: () => clients,
    ends: () => ends,
    run: (signal?: AbortSignal) =>
      execute('doji_employee_session', sql, params, signal || AbortSignal.timeout(1000)),
  };
}
test('fixed query uses TLS, restricted role, parameter binding, committed short transaction', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(), { state: 'ok' });
  const setup = present(f.calls[0]).text;
  assert.ok(typeof setup === 'string' && setup.startsWith('begin isolation level read committed;'));
  assert.equal(f.calls.length, 4, 'setup/identity, role, bound operation, commit');
  assert.equal(present(f.calls.at(-1)).text, 'commit');
  assert.deepEqual(present(f.calls.find((c) => typeof c.text === 'object')).text, {
    text: sql,
    values: params,
  });
  assert.equal(f.ends(), 1);
});
for (const [role, query] of [
  ['doji_business_session', sql],
  ['postgres', sql],
  ['__proto__', sql],
  ['doji_employee_session', 'select 1'],
  ['doji_employee_session', sql + '; select * from auth.users'],
] as const)
  test('reject role/SQL before network ' + role + ' ' + query.slice(-12), async () => {
    const f = fixture();
    await assert.rejects(f.execute(role, query, params, AbortSignal.timeout(1000)));
    assert.equal(f.clients(), 0);
  });
for (const identity of [
  { login: 'postgres' },
  { current_role: 'service_role' },
  { privileged: true },
  { inherits: true },
  { permitted: false },
])
  test('reject unsafe actual database identity ' + JSON.stringify(identity), async () => {
    const f = fixture({ identity });
    await assert.rejects(f.run());
    assert.ok(!f.calls.some((c) => typeof c.text === 'object'));
    assert.ok(!f.calls.some((c) => c.text === 'commit'));
    assert.equal(f.ends(), 1);
  });
test('invalid parameters rejected before socket creation', async () => {
  const f = fixture();
  for (const args of [
    [],
    [...params, 1],
    params.map((v, i) => (i === 0 ? {} : v)),
    params.map((v, i) => (i === 0 ? 'a\0b' : v)),
  ])
    await assert.rejects(
      Reflect.apply(f.execute, undefined, [
        'doji_employee_session',
        sql,
        args,
        AbortSignal.timeout(1000),
      ]),
    );
  assert.equal(f.clients(), 0);
});
test('SQLSTATE is preserved without secret/error detail', async () => {
  const f = fixture({
    query: async (text) => {
      if (typeof text === 'object')
        throw Object.assign(Error('SECRET database password'), { code: 'PT409' });
    },
  });
  await assert.rejects(
    f.run(),
    (error: unknown) =>
      testRecord(error).code === 'PT409' &&
      error instanceof Error &&
      !error.message.includes('SECRET'),
  );
  assert.equal(f.ends(), 1);
  assert.ok(!f.calls.some((c) => c.text === 'commit'));
});
test('abort closes uncertain connection without committing', async () => {
  const controller = new AbortController();
  const f = fixture({
    query: async (text) => {
      if (typeof text === 'object') {
        controller.abort();
        await new Promise(() => {});
      }
    },
  });
  await assert.rejects(f.run(controller.signal));
  assert.equal(f.ends(), 1);
  assert.ok(!f.calls.some((c) => c.text === 'commit'));
});
test('already aborted request opens no socket', async () => {
  const f = fixture(),
    c = new AbortController();
  c.abort();
  await assert.rejects(f.run(c.signal));
  assert.equal(f.clients(), 0);
});
test('no database owner, plaintext host, wrong port or tenant credential accepted', () => {
  for (const change of [
    { username: 'postgres' },
    { port: 5432 },
    { host: 'evil.test' },
    { realm: 'member' },
    { database: 'another' },
    { password: 'short' },
    { ca: false },
    { ca: 'not a certificate' },
  ])
    assert.throws(() =>
      Reflect.apply(createRestrictedSql, undefined, [{ ...config, ...change }, () => {}]),
    );
});

test('supplied CA retains certificate validation and default hostname checking', async () => {
  const ca = '-----BEGIN CERTIFICATE-----\nQUJD\n-----END CERTIFICATE-----\n';
  let options: ClientConfig | undefined;
  const execute = createRestrictedSql({ ...config, ca }, (value) => {
    options = value;
    return {
      async connect() {
        throw Error('test-only');
      },
      async end() {},
      async query() {
        assert.fail('No query after failed connection');
      },
    };
  });
  await assert.rejects(execute('doji_employee_session', sql, params, AbortSignal.timeout(1000)));
  const ssl = testRecord(present(options).ssl);
  assert.equal(ssl.ca, ca);
  assert.equal(ssl.rejectUnauthorized, true);
  assert.equal(ssl.checkServerIdentity, undefined);
});
