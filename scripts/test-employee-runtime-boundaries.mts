// Composition tests: real ingress/controller/provider/SQL adapters, synthetic I/O.
// No socket, credential, member auth or provider account is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createEmployeeRuntime } from '../infra/portal-identity-candidate/employee-runtime.mts';
import pages from '../infra/portal-identity-candidate/employee-pages-worker.mts';
import type { EmployeeRuntimeConfig } from '../infra/portal-identity-candidate/employee-runtime.mts';
import type { PortalFetch } from '../infra/portal-identity-candidate/portal-contracts.mts';
import type { PortalSqlClient } from '../infra/portal-identity-candidate/restricted-sql.mts';
import { present } from './employee-test-fixtures.mts';
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
