// Offline controller tests. No production accounts, email, or provider requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmployeeHttp } from '../infra/portal-identity-candidate/employee-http.mts';
import { createEmployeeSessionStore } from '../infra/portal-identity-candidate/employee-session-store.mts';
import type {
  EmployeeHttpConfig,
  EmployeeHttpDependencies,
} from '../infra/portal-identity-candidate/employee-http.mts';
import type { StoreExecute } from '../infra/portal-identity-candidate/employee-session-store.mts';
import type { EmployeeActor } from '../infra/portal-identity-candidate/employee-contracts.mts';
import { evidenceRecord, evidenceText } from './release-evidence.mts';
const origin = 'https://admin.test';
const config: EmployeeHttpConfig = {
  enabled: true,
  realm: 'employee',
  origin,
  clientId: 'client_employee',
  encryptionKey: 'ab'.repeat(32),
};
function fixture(overrides: Record<string, unknown> = {}) {
  let time = Date.now();
  const flows = new Map<string, string>(),
    sessions = new Map<string, string>(),
    calls = {
      begin: 0,
      prepare: 0,
      complete: 0,
      refresh: 0,
      verify: 0,
      revoke: 0,
      command: 0,
      authorize: 0,
    };
  const identity: EmployeeActor = {
    realm: 'employee',
    audience: config.clientId,
    issuer: `https://api.workos.com/user_management/${config.clientId}`,
    subject: 'user_owner',
    sessionId: 'session_owner',
    mfaVerified: true,
    expiresAtSeconds: Math.floor(time / 1000) + 900,
  };
  const state = {
    admission: true,
    authorize: true,
    failStore: false,
    remoteFails: false,
    wrongOtp: false,
    enroll: false,
  };
  const grant = () => ({
    subject: identity.subject,
    accessToken: 'PRIVATE-access',
    refreshToken: 'PRIVATE-refresh',
    mfaReceipt: 'PRIVATE-proof',
    identity: { ...identity },
  });
  const provider: EmployeeHttpDependencies['provider'] = {
    async begin(email, password) {
      calls.begin++;
      assert.equal(email, 'employee@example.test');
      assert.equal(password, 'PRIVATE-password');
      return { pending: 'PRIVATE-pending', enrollmentRequired: state.enroll };
    },
    async prepare() {
      calls.prepare++;
      return {
        pending: 'PRIVATE-challenge',
        ...(state.enroll ? { enrollmentSecret: 'A'.repeat(32) } : {}),
      };
    },
    async complete(pending, code) {
      calls.complete++;
      assert.equal(pending, 'PRIVATE-challenge');
      assert.equal(code, '123456');
      if (state.wrongOtp) throw Error('PRIVATE-error');
      return grant();
    },
    async verify() {
      calls.verify++;
      return { ...identity };
    },
    async refresh(saved) {
      calls.refresh++;
      assert.equal(saved.sessionId, 'session_owner');
      assert.equal(saved.mfaReceipt, 'PRIVATE-proof');
      identity.expiresAtSeconds = Math.floor(time / 1000) + 900;
      return grant();
    },
    async revoke(id) {
      calls.revoke++;
      assert.equal(id, 'session_owner');
      if (state.remoteFails) throw Error('PRIVATE-provider-error');
    },
  };
  const store: EmployeeHttpDependencies['store'] = {
    async putFlow(key, value) {
      flows.set(key, value);
    },
    async consumeFlow(key, accept) {
      const value = flows.get(key);
      if (!value || !accept(value)) return null;
      flows.delete(key);
      return value;
    },
    async putSession(key, value) {
      if (state.failStore) throw Error('PRIVATE-SQL');
      sessions.set(key, value);
    },
    async withSession(key, fn) {
      const value = sessions.get(key);
      return fn(
        value === undefined
          ? { value: null }
          : {
              value,
              remove: async () => {
                sessions.delete(key);
              },
              replace: async (next) => {
                sessions.set(key, next);
              },
            },
      );
    },
  };
  const application: EmployeeHttpDependencies['application'] = {
    async authorize() {
      calls.authorize++;
      if (!state.authorize) throw Error('PRIVATE-permissions');
      return { user_id: 'explicit-mapped-id', roles: ['operations'] };
    },
    async command(actor, input) {
      calls.command++;
      assert.equal(actor.subject, 'user_owner');
      return { name: input.name };
    },
  };
  const deps = {
    store,
    provider,
    application,
    admission: async () => state.admission,
    now: () => time,
  };
  let handle = createEmployeeHttp({ ...config, ...overrides }, deps);
  function request(
    path: string,
    input?: unknown,
    cookie?: string | null,
    csrf?: unknown,
    extra: Record<string, string> = {},
  ) {
    const headers = {
      origin,
      'sec-fetch-site': 'same-origin',
      ...(input !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { 'x-doji-csrf': evidenceText(csrf) } : {}),
      ...extra,
    };
    return handle(
      new Request(origin + path, {
        method: input === undefined ? 'GET' : 'POST',
        headers,
        ...(input !== undefined ? { body: JSON.stringify(input) } : {}),
      }),
    );
  }
  const cookieOf = (r: Response, name: string) =>
    r.headers
      .getSetCookie()
      .find((v) => v.startsWith(name + '='))
      ?.split(';')[0];
  const start = async () => {
    const r = await request('/auth/start', {
      email: 'employee@example.test',
      password: 'PRIVATE-password',
      proof: 'proof',
    });
    return {
      response: r,
      cookie: cookieOf(r, '__Host-doji_employee_login'),
      data: evidenceRecord(await r.json()),
    };
  };
  const login = async () => {
    const flow = await start(),
      r = await request('/auth/complete', { code: '123456' }, flow.cookie, flow.data.csrf);
    return {
      response: r,
      cookie: cookieOf(r, '__Host-doji_employee'),
      data: evidenceRecord(await r.json()),
      flow,
    };
  };
  return {
    state,
    calls,
    flows,
    sessions,
    identity,
    provider,
    application,
    store,
    request,
    start,
    login,
    advance: (ms: number) => (time += ms),
    restart: (changes = {}) => (handle = createEmployeeHttp({ ...config, ...changes }, deps)),
  };
}
test('password/TOTP installs only opaque host cookie; secrets encrypted at rest', async () => {
  const f = fixture(),
    s = await f.login();
  assert.equal(s.response.status, 200);
  assert.equal(s.data.assurance, 'aal2');
  assert.match(evidenceText(s.cookie), /^__Host-doji_employee=[A-Za-z0-9_-]{43}$/);
  assert.match(
    evidenceText(s.response.headers.getSetCookie()[0]),
    /Secure; HttpOnly; SameSite=Strict/,
  );
  assert.equal(s.response.headers.get('cache-control'), 'no-store');
  assert.equal(f.calls.authorize, 1);
  for (const value of [...f.flows.values(), ...f.sessions.values(), JSON.stringify(s.data)])
    assert.doesNotMatch(value, /PRIVATE|123456|employee@example/);
});
test('required enrollment exposes setup secret only to bound no-store response', async () => {
  const f = fixture();
  f.state.enroll = true;
  const s = await f.start();
  assert.equal(s.data.enrollmentRequired, true);
  assert.equal(s.data.enrollmentSecret, 'A'.repeat(32));
  assert.equal(s.response.headers.get('cache-control'), 'no-store');
  for (const value of f.flows.values()) assert.doesNotMatch(value, /AAAAAAAA/);
});
test('disabled controller never contacts provider', async () => {
  const f = fixture({ enabled: false });
  assert.equal((await f.start()).response.status, 503);
  assert.equal(f.calls.begin, 0);
});
test('realm and encryption configuration fail closed', () => {
  for (const overrides of [
    { realm: 'business' },
    { origin: 'http://admin.test' },
    { encryptionKey: 'bad' },
  ])
    assert.throws(() => fixture(overrides));
});
test('admission denial prevents password grant', async () => {
  const f = fixture();
  f.state.admission = false;
  assert.equal((await f.start()).response.status, 429);
  assert.equal(f.calls.begin, 0);
});
test('cross-origin login is denied', async () => {
  const f = fixture();
  assert.equal(
    (await f.request('/auth/start', {}, null, null, { origin: 'https://evil.test' })).status,
    403,
  );
  assert.equal(f.calls.begin, 0);
});
test('cross-site fetch and query injection are denied', async () => {
  const f = fixture();
  assert.equal(
    (await f.request('/auth/start', {}, null, null, { 'sec-fetch-site': 'cross-site' })).status,
    403,
  );
  assert.equal((await f.request('/auth/start?realm=business', {})).status, 403);
});
test('signup and unrecognized login fields denied', async () => {
  const f = fixture();
  assert.equal((await f.request('/auth/start', { signup: true })).status, 400);
  assert.equal((await f.request('/auth/signup', {})).status, 404);
  assert.equal(f.calls.begin, 0);
});
test('wrong browser/CSRF cannot consume real flow', async () => {
  const f = fixture(),
    s = await f.start();
  assert.equal(
    (await f.request('/auth/complete', { code: '123456' }, s.cookie, 'X'.repeat(43))).status,
    401,
  );
  assert.equal(f.flows.size, 1);
  assert.equal(f.calls.complete, 0);
  assert.equal(
    (await f.request('/auth/complete', { code: '123456' }, s.cookie, s.data.csrf)).status,
    200,
  );
});
test('MFA flow has exactly one concurrent winner', async () => {
  const f = fixture(),
    s = await f.start();
  const rs = await Promise.all(
    [1, 2].map(() => f.request('/auth/complete', { code: '123456' }, s.cookie, s.data.csrf)),
  );
  assert.deepEqual(rs.map((r) => r.status).sort(), [200, 401]);
  assert.equal(f.calls.complete, 1);
});
test('invalid OTP cannot be replayed', async () => {
  const f = fixture(),
    s = await f.start();
  f.state.wrongOtp = true;
  const r = await f.request('/auth/complete', { code: '123456' }, s.cookie, s.data.csrf);
  assert.equal(r.status, 503);
  assert.doesNotMatch(await r.text(), /PRIVATE/);
  assert.equal(
    (await f.request('/auth/complete', { code: '123456' }, s.cookie, s.data.csrf)).status,
    401,
  );
  assert.equal(f.calls.complete, 1);
});
test('expired pending flow cannot authenticate', async () => {
  const f = fixture(),
    s = await f.start();
  f.advance(300001);
  assert.equal(
    (await f.request('/auth/complete', { code: '123456' }, s.cookie, s.data.csrf)).status,
    401,
  );
  assert.equal(f.calls.complete, 0);
});
test('duplicate flow cookies rejected', async () => {
  const f = fixture(),
    s = await f.start();
  assert.equal(
    (await f.request('/auth/complete', { code: '123456' }, s.cookie + '; ' + s.cookie, s.data.csrf))
      .status,
    403,
  );
});
for (const change of [
  { realm: 'business' },
  { audience: 'client_business' },
  { issuer: 'https://wrong.test' },
  { mfaVerified: false },
])
  test('wrong verified identity denied ' + JSON.stringify(change), async () => {
    const f = fixture();
    Object.assign(f.identity, change);
    assert.equal((await f.login()).response.status, 401);
    assert.equal(f.sessions.size, 0);
    assert.equal(f.calls.authorize, 0);
  });
test('unmapped/disabled employee grant is revoked before session exists', async () => {
  const f = fixture();
  f.state.authorize = false;
  assert.equal((await f.login()).response.status, 503);
  assert.equal(f.sessions.size, 0);
  assert.equal(f.calls.revoke, 1);
});
test('failed durable install revokes grant', async () => {
  const f = fixture();
  f.state.failStore = true;
  assert.equal((await f.login()).response.status, 503);
  assert.equal(f.calls.revoke, 1);
});
test('sessions survive controller recreation but not key/origin changes', async () => {
  const f = fixture(),
    s = await f.login();
  f.restart();
  assert.equal((await f.request('/api/session', undefined, s.cookie)).status, 200);
  f.restart({ encryptionKey: 'cd'.repeat(32) });
  assert.equal((await f.request('/api/session', undefined, s.cookie)).status, 401);
  assert.equal(f.sessions.size, 0);
});
test('active login cannot be silently replaced', async () => {
  const f = fixture(),
    s = await f.login();
  assert.equal((await f.request('/auth/start', {}, s.cookie)).status, 409);
  assert.equal(f.calls.begin, 1);
});
test('refresh keeps subject/session/MFA receipt and returns no tokens', async () => {
  const f = fixture(),
    s = await f.login();
  f.advance(880000);
  const r = await f.request('/api/session', undefined, s.cookie);
  assert.equal(r.status, 200);
  assert.equal(f.calls.refresh, 1);
  assert.doesNotMatch(await r.text(), /PRIVATE/);
});
test('authorization revoked after login ends local session', async () => {
  const f = fixture(),
    s = await f.login();
  f.state.authorize = false;
  assert.equal((await f.request('/api/session', undefined, s.cookie)).status, 401);
  assert.equal(f.sessions.size, 0);
  assert.equal(f.calls.revoke, 1);
});
test('idle session expires and revokes only employee provider session', async () => {
  const f = fixture(),
    s = await f.login();
  f.advance(1800001);
  assert.equal((await f.request('/api/session', undefined, s.cookie)).status, 401);
  assert.equal(f.sessions.size, 0);
  assert.equal(f.calls.revoke, 1);
});
test('RPC requires CSRF and passes verified identity to restricted adapter', async () => {
  const f = fixture(),
    s = await f.login();
  assert.equal(
    (await f.request('/api/rpc', { name: 'get_admin_portal_session', args: {} }, s.cookie, 'bad'))
      .status,
    403,
  );
  assert.equal(f.calls.command, 0);
  assert.equal(
    (
      await f.request(
        '/api/rpc',
        { name: 'get_admin_portal_session', args: {} },
        s.cookie,
        s.data.csrf,
      )
    ).status,
    200,
  );
  assert.equal(f.calls.command, 1);
});
test('logout deletes local session even when provider unavailable', async () => {
  const f = fixture(),
    s = await f.login();
  f.state.remoteFails = true;
  const r = await f.request('/auth/logout', {}, s.cookie, s.data.csrf);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).remoteConfirmed, false);
  assert.equal(f.sessions.size, 0);
  assert.equal((await f.request('/api/session', undefined, s.cookie)).status, 401);
});
test('employee durable store cannot select business role/schema', async () => {
  const calls: Parameters<StoreExecute>[] = [];
  const execute: StoreExecute = async (...args) => {
    calls.push(args);
    return { state: 'ok' };
  };
  const store = createEmployeeSessionStore(config, execute);
  await store.putFlow('a'.repeat(64), 'A'.repeat(64), Date.now() + 10000);
  assert.ok(calls[0]);
  assert.equal(calls[0][0], 'doji_employee_session');
  assert.match(calls[0][1], /employee_session_private/);
  assert.doesNotMatch(calls[0][1], /business/);
  assert.throws(() =>
    createEmployeeSessionStore(
      { ...config, realm: 'business' } as unknown as EmployeeHttpConfig,
      execute,
    ),
  );
});
