// Composition tests: real ingress/controller/provider/SQL adapters, synthetic I/O.
// No socket, credential, member auth or provider account is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createEmployeeRuntime } from '../infra/portal-identity/employee-runtime.mts';
import pages from '../infra/portal-identity/employee-pages-worker.mts';
import type { EmployeeRuntimeConfig } from '../infra/portal-identity/employee-runtime.mts';
import type { PortalFetch } from '../infra/portal-identity/portal-contracts.mts';
import type { PortalSqlClient } from '../infra/portal-identity/restricted-sql.mts';
import { present } from './employee-test-fixtures.mts';
import { testRecord } from './employee-test-fixtures.mts';
// Deliberately incomplete environment bindings exercise runtime fail-closed paths.
async function pagesRequest(request: Request, env: unknown): Promise<Response> {
  const response: unknown = await Reflect.apply(pages.fetch, pages, [request, env]);
  assert.ok(response instanceof Response);
  return response;
}
const config: EmployeeRuntimeConfig = {
  enabled: true,
  realm: 'employee',
  origin: 'https://admin.dojipro.com',
  endpoint: 'https://abcdefghijklmnopqrst.supabase.co/functions/v1/employee-portal-v2',
  storageOrigin: 'https://abcdefghijklmnopqrst.supabase.co',
  proxyKey: 'ab'.repeat(32),
  clientId: 'client_synthetic',
  apiKey: 'sk_synthetic' + 'x'.repeat(32),
  encryptionKey: 'bc'.repeat(32),
  admissionKey: 'cd'.repeat(32),
  database: {
    host: 'aws-0-test.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    projectRef: 'abcdefghijklmnopqrst',
    username: 'doji_employee_portal_login.abcdefghijklmnopqrst',
    password: 'synthetic-'.repeat(8),
  },
};
const jwks = {
  keys: [
    {
      ...generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'jwk' }),
      kid: 'synthetic-key',
      alg: 'ES256',
      use: 'sig',
    },
  ],
};

for (const shared of [false, true])
  test(`complete composed password/MFA/session/logout flow: ${shared ? 'shared staging' : 'default issuer'}`, async () => {
    const policy: EmployeeRuntimeConfig = shared
      ? {
          ...config,
          origin: 'https://admin-staging.dojipro.com',
          clientId: 'client_01M51GRQJVKXFZ98RG21MK7J64',
          issuerClientId: 'client_01M3VE4WTBYS2XN6NZPH9EDMQD',
          endpoint: 'https://ohrcupagdoilkwhecict.supabase.co/functions/v1/employee-portal-v2',
          storageOrigin: 'https://ohrcupagdoilkwhecict.supabase.co',
          database: {
            ...config.database,
            projectRef: 'ohrcupagdoilkwhecict',
            username: 'doji_employee_portal_login.ohrcupagdoilkwhecict',
          },
        }
      : config;
    const keys = await generateKeyPair('ES256');
    const issuer = `https://api.workos.com/user_management/${policy.issuerClientId ?? policy.clientId}`;
    const signed = await new SignJWT({
      iss: issuer,
      aud: policy.clientId,
      client_id: policy.clientId,
      sub: 'user_employee',
      sid: 'session_employee',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300,
    })
      .setProtectedHeader({ alg: 'ES256', kid: 'composed' })
      .sign(keys.privateKey);
    const records = new Map<string, string>();
    let authorized = 0,
      revoked = false;
    const runtime = createEmployeeRuntime(policy, {
      createClient: () => ({
        connect: async () => {},
        end: async () => {},
        query: async (query) => {
          if (typeof query === 'string') {
            if (query.startsWith('begin isolation'))
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
                    },
                  ],
                },
              ];
            assert.match(query, /^(set local role doji_employee_(session|application)|commit)$/);
            return { rows: [] };
          }
          const p = query.values;
          let result: unknown;
          if (query.text.includes('admit_login')) result = true;
          else if (query.text.includes('execute_store')) {
            const key = String(p[2]) + ':' + String(p[3]);
            const value = records.get(key);
            switch (p[1]) {
              case 'put':
              case 'replace':
                records.set(key, String(p[4]));
                result = { state: 'ok' };
                break;
              case 'peek':
              case 'acquire':
                result = value ? { state: 'ok', value } : { state: 'missing' };
                break;
              case 'take':
                assert.equal(p[7], value);
                records.delete(key);
                result = value ? { state: 'ok', value } : { state: 'missing' };
                break;
              case 'remove':
                records.delete(key);
                result = { state: 'ok' };
                break;
              case 'release':
                result = { state: 'ok' };
                break;
              default:
                assert.fail('Unexpected store operation');
            }
          } else {
            assert.match(query.text, /employee_rpc_v1/);
            assert.deepEqual(p, [
              issuer,
              policy.clientId,
              'user_employee',
              'session_employee',
              true,
              'get_admin_portal_session_v3',
              '{}',
            ]);
            authorized++;
            result = { user_id: 'synthetic-principal', roles: ['super_admin'] };
          }
          return { rows: [{ result }] };
        },
      }),
      signStorage: () => assert.fail('No storage signing'),
      signRealtime: () => assert.fail('No realtime signing'),
      upstream: async (url, init) => {
        const user = { id: 'user_employee', email_verified: true };
        if (url === `https://api.workos.com/sso/jwks/${policy.issuerClientId ?? policy.clientId}`)
          return Response.json({
            keys: [
              { ...(await exportJWK(keys.publicKey)), kid: 'composed', alg: 'ES256', use: 'sig' },
            ],
          });
        const body = init?.body ? testRecord(JSON.parse(String(init.body))) : {};
        if (url === 'https://api.workos.com/user_management/authenticate') {
          assert.equal(body.client_id, policy.clientId);
          if (body.grant_type === 'password')
            return Response.json(
              {
                code: 'mfa_challenge',
                user,
                pending_authentication_token: 'synthetic-pending',
                authentication_factors: [{ type: 'totp', id: 'auth_factor_employee' }],
              },
              { status: 400 },
            );
          assert.equal(body.grant_type, 'urn:workos:oauth:grant-type:mfa-totp');
          assert.equal(body.code, '123456');
          return Response.json({ user, access_token: signed, refresh_token: 'synthetic-refresh' });
        }
        if (url === 'https://api.workos.com/auth/factors/auth_factor_employee/challenge')
          return Response.json({
            id: 'auth_challenge_employee',
            authentication_factor_id: 'auth_factor_employee',
            expires_at: new Date(Date.now() + 240000).toISOString(),
          });
        if (url === 'https://api.workos.com/user_management/users/user_employee')
          return Response.json(user);
        if (url === 'https://api.workos.com/user_management/users/user_employee/sessions?limit=10')
          return Response.json({
            data: [
              {
                id: 'session_employee',
                user_id: user.id,
                status: 'active',
                expires_at: new Date(Date.now() + 3600000).toISOString(),
              },
            ],
          });
        assert.equal(url, 'https://api.workos.com/user_management/sessions/revoke');
        assert.equal(body.session_id, 'session_employee');
        revoked = true;
        return new Response(null, { status: 204 });
      },
    });
    const call = (path: string, body?: unknown, cookie = '', csrf = '') =>
      runtime(
        new Request(policy.endpoint + path, {
          method: body === undefined ? 'GET' : 'POST',
          headers: {
            origin: policy.origin,
            'sec-fetch-site': 'same-origin',
            'x-doji-portal-proxy-key': policy.proxyKey,
            'x-doji-client-ip': '192.0.2.3',
            'content-type': 'application/json',
            cookie,
            'x-doji-csrf': csrf,
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      );
    const cookieOf = (r: Response, name: string) =>
      present(
        r.headers
          .getSetCookie()
          .find((c) => c.startsWith(name + '='))
          ?.split(';')[0],
      );
    const started = await call('/auth/start', {
      email: 'synthetic@example.test',
      password: 'synthetic-password',
    });
    assert.equal(started.status, 200);
    const start = testRecord(await started.json());
    const completed = await call(
      '/auth/complete',
      { code: '123456' },
      cookieOf(started, '__Host-doji_employee_login'),
      String(start.csrf),
    );
    assert.equal(completed.status, 200);
    assert.equal(revoked, false);
    const grant = testRecord(await completed.json());
    assert.equal(grant.signedIn, true);
    const cookie = cookieOf(completed, '__Host-doji_employee');
    assert.equal((await call('/api/session', undefined, cookie)).status, 200);
    assert.equal(authorized, 2);
    assert.equal((await call('/auth/logout', {}, cookie, String(grant.csrf))).status, 200);
    assert.equal(revoked, true);
    assert.equal(records.size, 0);
  });
test('staging binds the WorkOS realm, SQL project and storage without production monitoring', async () => {
  const staging: EmployeeRuntimeConfig = {
    ...config,
    origin: 'https://admin-staging.dojipro.com',
    clientId: 'client_01M3T5GJM7JZVQQ7CGHNJD0QMZ',
    endpoint: 'https://ohrcupagdoilkwhecict.supabase.co/functions/v1/employee-portal-v2',
    storageOrigin: 'https://ohrcupagdoilkwhecict.supabase.co',
    database: {
      ...config.database,
      projectRef: 'ohrcupagdoilkwhecict',
      username: 'doji_employee_portal_login.ohrcupagdoilkwhecict',
    },
  };
  const f = fixture({ patch: staging });
  const response = await f.runtime(
    new Request(staging.endpoint + '/api/session', {
      headers: {
        origin: staging.origin,
        'sec-fetch-site': 'same-origin',
        'x-doji-portal-proxy-key': staging.proxyKey,
        'x-doji-client-ip': '192.0.2.3',
      },
    }),
  );
  assert.equal(response.status, 401);
  assert.equal(f.calls.length, 0);
  assert.equal(f.database.length, 0);
  for (const patch of [
    { database: config.database },
    { storageOrigin: config.storageOrigin },
    { clientId: config.clientId },
    { endpoint: config.endpoint },
    { origin: config.origin },
    { monitoring: {} },
  ])
    assert.throws(() => Reflect.apply(fixture, undefined, [{ patch: { ...staging, ...patch } }]));
  const shared = {
    ...staging,
    clientId: 'client_01M51GRQJVKXFZ98RG21MK7J64',
    issuerClientId: 'client_01M3VE4WTBYS2XN6NZPH9EDMQD',
  };
  assert.doesNotThrow(() => fixture({ patch: shared }));
  assert.doesNotThrow(() =>
    fixture({ patch: { ...shared, monitoring: { environment: 'staging' } } }),
  );
  assert.throws(() => fixture({ patch: { ...shared, monitoring: { environment: 'production' } } }));
  assert.throws(() => fixture({ patch: { monitoring: { environment: 'staging' } } }));
  for (const patch of [
    { issuerClientId: undefined },
    { issuerClientId: shared.clientId },
    { clientId: staging.clientId },
    { clientId: shared.issuerClientId },
    { origin: config.origin },
    { database: config.database },
  ])
    assert.throws(() => fixture({ patch: { ...shared, ...patch } }));
});
const request = (path = '/auth/start', headers = {}) =>
  new Request(config.endpoint + path, {
    method: path === '/api/session' ? 'GET' : 'POST',
    headers: {
      origin: config.origin,
      'sec-fetch-site': 'same-origin',
      'x-doji-portal-proxy-key': config.proxyKey,
      'x-doji-client-ip': '192.0.2.3',
      'content-type': 'application/json',
      ...headers,
    },
    ...(path === '/api/session'
      ? {}
      : {
          body: JSON.stringify({ email: 'synthetic@example.test', password: 'test-only-password' }),
        }),
  });
type ProviderCall = { url: string; options: RequestInit | undefined };
function fixture({
  allowed = true,
  keys,
  patch = {},
}: {
  allowed?: boolean;
  keys?: (calls: ProviderCall[]) => Response | Promise<Response>;
  patch?: Partial<EmployeeRuntimeConfig>;
} = {}) {
  const calls: ProviderCall[] = [],
    database: Parameters<PortalSqlClient['query']>[0][] = [];
  let time = Date.now();
  const runtime = createEmployeeRuntime(
    { ...config, ...patch },
    {
      now: () => time,
      createClient: () => ({
        connect: async () => {},
        end: async () => {},
        query: async (query) => {
          database.push(query);
          if (typeof query === 'string' && query.startsWith('begin isolation'))
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
                  },
                ],
              },
            ];
          return { rows: typeof query === 'object' ? [{ result: allowed }] : [] };
        },
      }),
      signStorage: () => {
        throw Error('No signing authorized in fixture');
      },
      signRealtime: () => {
        throw Error('No signing authorized in fixture');
      },
      upstream: async (url, options) => {
        calls.push({ url, options });
        if (url.includes('/sso/jwks/')) return keys ? keys(calls) : Response.json(jwks);
        assert.equal(url, 'https://api.workos.com/user_management/authenticate');
        return Response.json({ message: 'Synthetic denied credentials' }, { status: 401 });
      },
    },
  );
  return {
    runtime,
    calls,
    database,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

for (const patch of [
  { realm: 'business' },
  { origin: 'https://business.dojipro.com' },
  { clientId: '' },
])
  test(`runtime rejects invalid realm/origin/client ${JSON.stringify(patch)}`, () =>
    assert.throws(() => Reflect.apply(fixture, undefined, [{ patch }])));
test('anonymous session and rejected ingress never touch database, provider or signer', async () => {
  const f = fixture();
  assert.equal((await f.runtime(request('/api/session'))).status, 401);
  assert.equal(
    (await f.runtime(request('/auth/start', { 'x-doji-portal-proxy-key': '' }))).status,
    403,
  );
  assert.equal(f.calls.length, 0);
  assert.equal(f.database.length, 0);
});
test('disabled runtime makes no database or provider requests', async () => {
  const f = fixture({ patch: { enabled: false } });
  assert.equal((await f.runtime(request())).status, 503);
  assert.equal(f.calls.length, 0);
  assert.equal(f.database.length, 0);
});
test('durable admission rejects before provider key retrieval', async () => {
  const f = fixture({ allowed: false });
  assert.equal((await f.runtime(request())).status, 429);
  assert.equal(f.calls.length, 0);
  assert.equal(f.database.filter((query) => typeof query === 'object').length, 1);
  assert.equal(f.database.at(-1), 'commit');
});
test('provider keys are reused within TTL and refreshed when expired', async () => {
  const f = fixture();
  // Provider errors have no trusted HTTP status and map to the controller's
  // generic 503 boundary, never to a successful session.
  for (let i = 0; i < 2; i++) assert.equal((await f.runtime(request())).status, 503);
  assert.equal(f.calls.filter((call) => call.url.includes('/sso/jwks/')).length, 1);
  f.advance(300001);
  assert.equal((await f.runtime(request())).status, 503);
  assert.equal(f.calls.filter((call) => call.url.includes('/sso/jwks/')).length, 2);
  assert.equal(f.calls.filter((call) => call.url.endsWith('/authenticate')).length, 3);
  assert.ok(f.calls.every((call) => call.options?.redirect === 'error'));
});
test('concurrent authentication shares only pending key fetch, not authentication requests', async () => {
  let resolveKeys: (value: Response) => void = () => assert.fail('Gate not initialized');
  const waiting = new Promise<Response>((resolve) => {
    resolveKeys = resolve;
  });
  const f = fixture({ keys: () => waiting });
  const first = f.runtime(request()),
    second = f.runtime(request());
  for (let i = 0; i < 10 && !f.calls.length; i++) await new Promise(setImmediate);
  assert.equal(f.calls.length, 1);
  resolveKeys(Response.json(jwks));
  const responses = await Promise.all([first, second]);
  assert.deepEqual(
    responses.map((response) => response.status),
    [503, 503],
  );
  assert.equal(f.calls.filter((call) => call.url.endsWith('/authenticate')).length, 2);
});
test('failed expired key refresh cannot reuse stale keys; later explicit request can recover', async () => {
  let attempts = 0;
  const f = fixture({
    keys: () => (++attempts === 2 ? new Response(null, { status: 503 }) : Response.json(jwks)),
  });
  await f.runtime(request());
  f.advance(300001);
  assert.equal((await f.runtime(request())).status, 503);
  assert.equal(f.calls.filter((call) => call.url.endsWith('/authenticate')).length, 1);
  await f.runtime(request());
  assert.equal(attempts, 3);
  assert.equal(f.calls.filter((call) => call.url.endsWith('/authenticate')).length, 2);
});
for (const body of [{ keys: [] }, 'malformed', { keys: [], padding: 'a'.repeat(34000) }])
  test(`invalid or oversized JWKS fails before authentication ${typeof body === 'string' ? body : JSON.stringify(body).slice(0, 30)}`, async () => {
    const f = fixture({
      keys: () => (typeof body === 'string' ? new Response(body) : Response.json(body)),
    });
    assert.equal(
      (await f.runtime(request())).status,
      typeof body === 'object' && 'padding' in body && body.padding ? 413 : 503,
    );
    assert.equal(f.calls.length, 1);
  });

test('Pages setup callback is handled before auth proxy or static assets', async () => {
  const response = await pagesRequest(
    new Request(config.origin + '/identity/setup-complete?code=synthetic'),
    {},
  );
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), config.origin + '/identity/setup-complete');
});
test('Pages static path preserves the request and exact asset response', async () => {
  const req = new Request(config.origin + '/styles.css');
  const expected = new Response('synthetic css');
  const response = await pagesRequest(req, {
    ASSETS: {
      fetch: async (actual: Request) => {
        assert.equal(actual, req);
        return expected;
      },
    },
  });
  assert.equal(response, expected);
});
for (const path of ['/auth/start', '/api/session'])
  test(`Pages invalid proxy config fails closed without assets fallback: ${path}`, async () => {
    const response = await pagesRequest(new Request(config.origin + path), {});
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });
test('Pages enabled proxy forwards through the fixed employee ingress and returns safe headers', async (t) => {
  let sent: { url: Parameters<PortalFetch>[0]; options?: RequestInit } | undefined;
  const upstream: PortalFetch = async (url, options) => {
    sent = { url, options };
    return Response.json({ signedIn: false }, { status: 401 });
  };
  t.mock.method(globalThis, 'fetch', upstream);
  const response = await pagesRequest(
    new Request(config.origin + '/api/session', { headers: { origin: config.origin } }),
    {
      EMPLOYEE_V2_ENABLED: 'true',
      EMPLOYEE_V2_ENDPOINT: config.endpoint,
      EMPLOYEE_V2_PROXY_KEY: config.proxyKey,
    },
  );
  assert.equal(response.status, 401);
  assert.equal(present(sent).url, config.endpoint + '/api/session');
  assert.equal(
    new Headers(present(present(sent).options).headers).get('x-doji-portal-proxy-key'),
    config.proxyKey,
  );
  assert.equal(response.headers.get('x-doji-portal-proxy-key'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
