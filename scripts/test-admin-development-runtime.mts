import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import {
  createDevelopmentGateway,
  createDevelopmentSql,
  developmentEndpoint,
  developmentSql,
} from '../infra/portal-identity/admin-development.mts';
import type { PortalSqlClient } from '../infra/portal-identity/restricted-sql.mts';

const token = 'a'.repeat(43);
const persona = '98000000-0000-4000-8000-000000000001';
const call = { persona, name: 'get_admin_portal_session_v3', args: {}, requestId: randomUUID() };
const config = {
  host: 'aws-0-ca-central-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  projectRef: 'ohrcupagdoilkwhecict',
  username: 'doji_staging_development_login.ohrcupagdoilkwhecict',
  password: 'synthetic-only-'.repeat(4),
};
const request = (
  body: unknown = call,
  extra: Record<string, string> = {},
  url = developmentEndpoint,
) =>
  new Request(url, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', ...extra },
    body: JSON.stringify(body),
  });
test('development ingress denies browser/prod/malformed requests before SQL', async () => {
  let calls = 0;
  const handler = createDevelopmentGateway(async () => {
    calls++;
    return { ok: true, result: { user_id: persona } };
  });
  for (const r of [
    request(call, { origin: 'http://127.0.0.1:4313' }),
    request(call, { cookie: 'x=y' }),
    request(call, { 'sec-fetch-site': 'same-origin' }),
    request(call, { authorization: '' }),
    request({ ...call, extra: true }),
    request(call, {}, developmentEndpoint.replace('ohrcupagdoilkwhecict', 'tvixsmqxotuvyjqzmjla')),
  ])
    assert.ok((await handler(r)).status >= 400);
  assert.equal(calls, 0);
  const ok = await handler(request());
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('access-control-allow-origin'), null);
  assert.deepEqual(await ok.json(), { user_id: persona });
  assert.equal(calls, 1);
  assert.equal((await handler(request(call, {}, 'http://ohrcupagdoilkwhecict.supabase.co/admin-development'))).status, 200);
});
test('gateway maps denials, hides raw errors and bounds concurrent SQL', async () => {
  for (const [code, status] of [
    ['42501', 403],
    ['22023', 400],
    ['PT409', 409],
    ['XX000', 503],
  ] as const) {
    const response = await createDevelopmentGateway(async () => ({ ok: false, code }))(request());
    assert.equal(response.status, status);
  }
  const failure = await createDevelopmentGateway(async () => {
    throw Error(token);
  })(request());
  assert.equal(failure.status, 503);
  assert.ok(!(await failure.text()).includes(token));
  let release!: (v: unknown) => void;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const handler = createDevelopmentGateway(async () => pending);
  const first = handler(request()),
    second = handler(request());
  assert.equal((await handler(request())).status, 503);
  release({ ok: true, result: {} });
  await Promise.all([first, second]);
});
test('restricted SQL verifies login, binds digest and closes once without retry', async () => {
  const queries: Parameters<PortalSqlClient['query']>[0][] = [];
  let ended = 0;
  const execute = createDevelopmentSql(config, (options) => {
    assert.deepEqual(options.ssl, { rejectUnauthorized: true });
    assert.equal(options.port, 6543);
    return {
      connect: async () => {},
      end: async () => {
        ended++;
      },
      query: async (input) => {
        queries.push(input);
        if (typeof input === 'string' && input.startsWith('select session_user'))
          return {
            rows: [
              {
                login: 'doji_staging_development_login',
                current_role: 'doji_staging_development_login',
                privileged: false,
                permitted: true,
              },
            ],
          };
        return { rows: [{ result: { ok: true, result: {} } }] };
      },
    };
  });
  await execute(token, call, new AbortController().signal);
  const query = queries.find((q) => typeof q !== 'string');
  assert.equal(typeof query, 'object');
  if (typeof query !== 'object') throw Error('Missing parameter query');
  assert.equal(query.text, developmentSql);
  assert.equal(query.values[0], createHash('sha256').update(token).digest('hex'));
  assert.ok(!JSON.stringify(queries).includes(token));
  assert.equal(queries.at(-1), 'commit');
  assert.equal(ended, 1);
  assert.throws(() =>
    createDevelopmentSql({ ...config, projectRef: 'tvixsmqxotuvyjqzmjla' }, () => {
      throw Error('Must not connect');
    }),
  );
});
test('incorrect SQL identity never invokes a command; aborted calls never connect', async () => {
  let invoked = 0,
    connected = 0,
    ended = 0;
  const execute = createDevelopmentSql(config, () => ({
    connect: async () => {
      connected++;
    },
    end: async () => {
      ended++;
    },
    query: async (input) => {
      if (typeof input !== 'string') invoked++;
      return { rows: [{ login: 'postgres', privileged: true }] };
    },
  }));
  await assert.rejects(execute(token, call, new AbortController().signal));
  assert.equal(invoked, 0);
  assert.equal(connected, 1);
  assert.equal(ended, 1);
  await assert.rejects(execute(token, call, AbortSignal.abort()));
  assert.equal(connected, 1);
});
