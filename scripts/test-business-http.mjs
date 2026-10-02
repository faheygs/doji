// Offline transport contract tests. In-memory store and provider/DB fixtures are
// NOT production adapters; no WorkOS/Doji call, email, login or database mutation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createBusinessHttp } from '../infra/portal-identity-candidate/business-http.mjs';
import { createWorkosBusinessProvider } from '../infra/portal-identity-candidate/workos-business-provider.mjs';
import { createBusinessBrowserClient } from '../infra/portal-identity-candidate/business-browser-client.mjs';
import { createBusinessApplicationAdapter } from '../infra/portal-identity-candidate/business-application-adapter.mjs';
import { createApplicationController } from '../website/business-portal/application-client.js';
import { boundedBody } from '../infra/portal-identity-candidate/bounded-body.mjs';
const origin = 'https://business.test';
const config = {
  enabled: true,
  signupEnabled: true,
  realm: 'business',
  origin,
  clientId: 'client_business',
  encryptionKey: 'ab'.repeat(32),
  termsVersion: 'terms-v1',
  privacyVersion: 'privacy-v1',
};
const signup = {
  signup: true,
  termsAccepted: true,
  privacyAcknowledged: true,
  country: 'US',
  termsVersion: 'terms-v1',
  privacyVersion: 'privacy-v1',
};
const hash = (v) => createHash('sha256').update(v).digest('hex');
function fixture(overrides = {}) {
  let time = Date.now(),
    gate = true,
    badIdentity = false,
    remoteFails = false,
    authFails = false;
  const flows = new Map(),
    sessions = new Map(),
    locks = new Map();
  const counts = { exchange: 0, refresh: 0, revoke: 0, enroll: 0, command: 0, read: 0 };
  const actor = {
    realm: 'business',
    issuer: 'https://api.workos.com/user_management/client_business',
    audience: 'client_business',
    subject: 'user_business',
    sessionId: 'session_business',
    mfaVerified: false,
    expiresAtSeconds: time / 1000 + 900,
  };
  const tokens = {
    subject: 'user_business',
    accessToken: 'secret-access',
    refreshToken: 'secret-refresh',
  };
  const provider = {
    authorizationUrl(values) {
      return 'https://api.workos.com/user_management/authorize?' + new URLSearchParams(values);
    },
    async exchange(code, verifier) {
      counts.exchange++;
      assert.ok(verifier.length === 43);
      return tokens;
    },
    async refresh() {
      counts.refresh++;
      return tokens;
    },
    async revoke(id) {
      counts.revoke++;
      assert.equal(id, 'session_business');
      if (remoteFails) throw Error('PRIVATE upstream details');
    },
  };
  const store = {
    async putFlow(id, value) {
      flows.set(id, value);
    },
    async consumeFlow(id, accept) {
      const value = flows.get(id);
      if (!value || !accept(value)) return null;
      flows.delete(id);
      return value;
    },
    async putSession(id, value) {
      sessions.set(id, value);
    },
    async withSession(id, fn) {
      const prior = locks.get(id) || Promise.resolve();
      let release;
      const held = new Promise((r) => (release = r));
      locks.set(id, held);
      await prior;
      try {
        return await fn({
          value: sessions.get(id),
          remove: async () => sessions.delete(id),
          replace: async (v) => sessions.set(id, v),
        });
      } finally {
        release();
        if (locks.get(id) === held) locks.delete(id);
      }
    },
  };
  const application = {
    async authorize() {
      if (authFails) throw Error('PRIVATE application denial');
    },
    async enroll(a, agreements) {
      counts.enroll++;
      assert.equal(a.subject, 'user_business');
      assert.equal(agreements.termsVersion, 'terms-v1');
      if (authFails) throw Error('Enrollment failed');
    },
    async read() {
      if (authFails) throw Object.assign(Error('Denied'), { status: 401 });
      counts.read++;
      return { id: 'application1', state: 'draft', revision: 1, details: {} };
    },
    async command(a, input) {
      counts.command++;
      assert.equal(a.subject, 'user_business');
      return {
        outcome: { state: input.action === 'submit' ? 'pending' : 'draft' },
        replayed: false,
      };
    },
  };
  const verify = async () => ({ ...actor, ...(badIdentity ? { subject: 'user_employee' } : {}) });
  const handler = createBusinessHttp(
    { ...config, ...overrides },
    { store, provider, verify, application, admission: async () => gate, now: () => time },
  );
  const req = (
    path,
    { method = 'GET', data, cookies = '', headers = {}, omitOrigin = false } = {},
  ) =>
    handler(
      new Request(origin + path, {
        method,
        headers: {
          ...(omitOrigin ? {} : { origin }),
          ...(data ? { 'content-type': 'application/json' } : {}),
          cookie: cookies,
          ...headers,
        },
        ...(data ? { body: JSON.stringify(data) } : {}),
      }),
    );
  async function start(input = { signup: false }) {
    const result = await req('/auth/start', { method: 'POST', data: input });
    assert.equal(result.status, 200);
    const data = await result.json();
    return {
      state: new URL(data.authorizationUrl).searchParams.get('state'),
      cookies: result.headers.getSetCookie()[0].split(';')[0],
      result,
      data,
    };
  }
  async function callback(flow, extra = '') {
    return req('/auth/callback?state=' + flow.state + '&code=valid_code' + extra, {
      cookies: flow.cookies,
      omitOrigin: true,
    });
  }
  async function login(input) {
    const flow = await start(input);
    const result = await callback(flow);
    assert.equal(result.status, 303);
    assert.equal(result.headers.get('location'), origin + '/business-portal/application/');
    const cookies = result.headers
      .getSetCookie()
      .find((s) => s.startsWith('__Host-doji_business='))
      .split(';')[0];
    const session = await req('/api/session', { cookies });
    assert.equal(session.status, 200);
    return { cookies, csrf: (await session.json()).csrf, result };
  }
  return {
    handler,
    req,
    start,
    callback,
    login,
    counts,
    flows,
    sessions,
    actor,
    store,
    provider,
    application,
    advance: (ms) => (time += ms),
    denyAdmission: () => (gate = false),
    changeIdentity: () => (badIdentity = true),
    failRemote: () => (remoteFails = true),
    denyAccount: () => (authFails = true),
  };
}
test('disabled endpoint rejects before provider calls', async () => {
  const f = fixture({ enabled: false });
  assert.equal(
    (await f.req('/auth/start', { method: 'POST', data: { signup: false } })).status,
    503,
  );
  assert.equal(f.counts.exchange, 0);
});
test(
  'aborted stalled input returns even when cancellation never settles',
  { timeout: 1000 },
  async () => {
    const f = fixture();
    const controller = new AbortController();
    const request = new Request(origin + '/auth/start', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: new ReadableStream({ cancel: () => new Promise(() => {}) }),
      duplex: 'half',
      signal: controller.signal,
    });
    const result = f.handler(request);
    await new Promise((resolve) => setImmediate(resolve));
    controller.abort();
    assert.equal((await result).status, 503);
    assert.equal(f.flows.size, 0);
    assert.equal(f.counts.exchange, 0);
  },
);
test('oversized input is rejected before admission or flow storage', async () => {
  const f = fixture();
  assert.equal(
    (
      await f.req('/auth/start', {
        method: 'POST',
        data: { signup: false, proof: 'x'.repeat(17000) },
      })
    ).status,
    413,
  );
  assert.equal(f.flows.size, 0);
});
test('bounded response reader rejects aborted upstream stream', { timeout: 1000 }, async () => {
  const controller = new AbortController();
  const result = boundedBody(
    new ReadableStream({ cancel: () => new Promise(() => {}) }),
    controller.signal,
    100,
  );
  controller.abort();
  await assert.rejects(result, /interrupted/);
});
test('bounded response reader rejects size overflow and handles chunk boundaries', async () => {
  const stream = () =>
    new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array([1, 2]));
        c.enqueue(new Uint8Array([3]));
        c.close();
      },
    });
  assert.deepEqual(
    await boundedBody(stream(), new AbortController().signal, 3),
    new Uint8Array([1, 2, 3]),
  );
  await assert.rejects(boundedBody(stream(), new AbortController().signal, 2), { status: 413 });
});
test('queued logout after refresh removes the session permanently', async () => {
  const f = fixture();
  const logged = await f.login();
  f.advance(880000);
  let release, started;
  const ready = new Promise((r) => {
    started = r;
  });
  const held = new Promise((r) => {
    release = r;
  });
  const refresh = f.provider.refresh;
  f.provider.refresh = async () => {
    started();
    await held;
    return refresh();
  };
  const read = f.req('/api/session', { cookies: logged.cookies });
  await ready;
  const logout = f.req('/auth/logout', {
    method: 'POST',
    data: {},
    cookies: logged.cookies,
    headers: { 'x-doji-csrf': logged.csrf },
  });
  release();
  assert.equal((await read).status, 200);
  assert.equal((await logout).status, 200);
  assert.equal(f.sessions.size, 0);
  assert.equal((await f.req('/api/session', { cookies: logged.cookies })).status, 401);
});
test('refresh cannot silently move a browser to another provider session', async () => {
  const f = fixture();
  const logged = await f.login();
  f.advance(880000);
  f.actor.sessionId = 'session_other';
  assert.equal((await f.req('/api/session', { cookies: logged.cookies })).status, 401);
  assert.equal(f.sessions.size, 0);
});
test('start uses one-time state, PKCE and host-only secure HttpOnly cookie', async () => {
  const f = fixture(),
    a = await f.start(),
    b = await f.start();
  assert.notEqual(a.state, b.state);
  const u = new URL(a.data.authorizationUrl);
  assert.equal(u.searchParams.get('challenge').length, 43);
  assert.equal(u.searchParams.get('redirectUri'), origin + '/auth/callback');
  assert.match(a.result.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Lax/);
  assert.doesNotMatch(a.result.headers.get('set-cookie'), /Domain=/);
  assert.ok(!JSON.stringify([...f.flows.values()]).includes('verifier'));
});
for (const [label, input] of [
  ['terms', { ...signup, termsAccepted: false }],
  ['privacy', { ...signup, privacyAcknowledged: false }],
  ['country', { ...signup, country: 'CA' }],
  ['stale legal', { ...signup, termsVersion: 'old' }],
  ['arbitrary identity', { ...signup, subject: 'user_other' }],
])
  test(label + ' cannot start signup', async () => {
    const f = fixture();
    assert.ok((await f.req('/auth/start', { method: 'POST', data: input })).status >= 400);
    assert.equal(f.flows.size, 0);
  });
test('server admission is required for sign-in and signup', async () => {
  const f = fixture();
  f.denyAdmission();
  for (const data of [signup, { signup: false }])
    assert.equal((await f.req('/auth/start', { method: 'POST', data })).status, 429);
});
test('closed signup leaves sign-in available', async () => {
  const f = fixture({ signupEnabled: false });
  assert.equal((await f.req('/auth/start', { method: 'POST', data: signup })).status, 403);
  await f.start();
});
for (const [label, headers, omitOrigin] of [
  ['cross origin', { origin: 'https://evil.test' }, false],
  ['same-site sibling', { 'sec-fetch-site': 'same-site' }, false],
  ['missing origin', {}, true],
])
  test(label + ' rejected before start', async () => {
    const f = fixture();
    assert.equal(
      (await f.req('/auth/start', { method: 'POST', data: { signup: false }, headers, omitOrigin }))
        .status,
      403,
    );
    assert.equal(f.flows.size, 0);
  });
test('unbound callback does not consume another browser login', async () => {
  const f = fixture(),
    flow = await f.start();
  const r = await f.callback({ ...flow, cookies: '__Host-doji_business_login=' + 'x'.repeat(43) });
  assert.match(r.headers.get('location'), /signin=failed/);
  assert.equal(f.counts.exchange, 0);
  await f.callback(flow);
  assert.equal(f.counts.exchange, 1);
});
test('callback is single-use under concurrent replay', async () => {
  const f = fixture(),
    flow = await f.start();
  const r = await Promise.all([f.callback(flow), f.callback(flow)]);
  assert.equal(f.counts.exchange, 1);
  assert.equal(r.filter((v) => v.headers.get('location').includes('application')).length, 1);
});
test('expired callback is denied', async () => {
  const f = fixture(),
    flow = await f.start();
  f.advance(300001);
  await f.callback(flow);
  assert.equal(f.counts.exchange, 0);
});
test('duplicate state or provider error cannot authenticate', async () => {
  const f = fixture(),
    flow = await f.start();
  await f.callback(flow, '&state=' + flow.state);
  assert.equal(f.counts.exchange, 0);
  await f.callback(flow, '&error=access_denied');
  assert.equal(f.counts.exchange, 0);
});
test('wrong directory or subject never creates browser session', async () => {
  const f = fixture(),
    flow = await f.start();
  f.changeIdentity();
  await f.callback(flow);
  assert.equal(f.sessions.size, 0);
});
test('sign-in never invents signup agreement', async () => {
  const f = fixture();
  await f.login();
  assert.equal(f.counts.enroll, 0);
});
test('signup completion records server-bound agreements, no provider tokens reach browser', async () => {
  const f = fixture(),
    s = await f.login(signup);
  assert.equal(f.counts.enroll, 1);
  const r = await f.req('/api/session', { cookies: s.cookies });
  const text = await r.text();
  assert.doesNotMatch(text, /secret-|user_business|refresh|accessToken/);
  assert.doesNotMatch([...f.sessions.values()].join(), /secret-|csrf|subject/);
  assert.equal(r.headers.get('cache-control'), 'no-store');
});
test('failed enrollment revokes newly granted provider session', async () => {
  const f = fixture(),
    flow = await f.start(signup);
  f.denyAccount();
  await f.callback(flow);
  assert.equal(f.counts.revoke, 1);
  assert.equal(f.sessions.size, 0);
});
test('application read and submit require session and CSRF', async () => {
  const f = fixture(),
    s = await f.login();
  assert.equal((await f.req('/api/application', { cookies: s.cookies })).status, 200);
  assert.equal(
    (
      await f.req('/api/application', {
        method: 'POST',
        cookies: s.cookies,
        data: { action: 'submit' },
      })
    ).status,
    403,
  );
  const r = await f.req('/api/application', {
    method: 'POST',
    cookies: s.cookies,
    headers: { 'x-doji-csrf': s.csrf },
    data: { action: 'submit' },
  });
  assert.equal((await r.json()).outcome.state, 'pending');
  assert.equal(f.counts.command, 1);
});
test('duplicate cookies fail closed', async () => {
  const f = fixture(),
    s = await f.login();
  assert.equal(
    (await f.req('/api/session', { cookies: s.cookies + '; ' + s.cookies })).status,
    401,
  );
});
test('idle and absolute expiration remove server session', async () => {
  const f = fixture(),
    s = await f.login();
  f.advance(30 * 60000 + 1);
  assert.equal((await f.req('/api/session', { cookies: s.cookies })).status, 401);
  assert.equal(f.sessions.size, 0);
  const g = fixture(),
    t = await g.login();
  g.advance(8 * 3600000 + 1);
  assert.equal((await g.req('/api/session', { cookies: t.cookies })).status, 401);
});
test('revoked account cannot read even with valid cookie', async () => {
  const f = fixture(),
    s = await f.login();
  f.denyAccount();
  assert.equal((await f.req('/api/application', { cookies: s.cookies })).status, 401);
  assert.equal(f.counts.read, 0);
  assert.equal(f.sessions.size, 0);
});
test('refresh serialized and scoped to same subject and provider session', async () => {
  const f = fixture(),
    s = await f.login();
  f.actor.expiresAtSeconds = Date.now() / 1000 + 1;
  await f.req('/api/session', { cookies: s.cookies }); // store near expiry
  f.actor.expiresAtSeconds = Date.now() / 1000 + 900;
  await Promise.all([
    f.req('/api/session', { cookies: s.cookies }),
    f.req('/api/session', { cookies: s.cookies }),
  ]);
  assert.equal(f.counts.refresh, 1);
});
test('logout deletes local session even if provider revoke fails', async () => {
  const f = fixture(),
    s = await f.login();
  f.failRemote();
  const r = await f.req('/auth/logout', {
    method: 'POST',
    cookies: s.cookies,
    headers: { 'x-doji-csrf': s.csrf },
    data: {},
  });
  assert.deepEqual(await r.json(), { signedIn: false, remoteConfirmed: false });
  assert.equal(f.sessions.size, 0);
  assert.equal((await f.req('/api/session', { cookies: s.cookies })).status, 401);
});
test('logout without CSRF cannot revoke account', async () => {
  const f = fixture(),
    s = await f.login();
  assert.equal(
    (await f.req('/auth/logout', { method: 'POST', cookies: s.cookies, data: {} })).status,
    403,
  );
  assert.equal(f.counts.revoke, 0);
});
test('tampered encrypted server record is rejected and removed', async () => {
  const f = fixture(),
    s = await f.login();
  f.sessions.set(hash(s.cookies.split('=')[1]), 'corrupt');
  assert.equal((await f.req('/api/session', { cookies: s.cookies })).status, 401);
  assert.equal(f.sessions.size, 0);
});
test('unknown routes and query overrides do not reach business commands', async () => {
  const f = fixture(),
    s = await f.login();
  assert.equal((await f.req('/api/admin', { cookies: s.cookies })).status, 404);
  assert.equal(
    (await f.req('/api/application?subject=user_other', { cookies: s.cookies })).status,
    400,
  );
  assert.equal(f.counts.command, 0);
});
test('WorkOS adapter emits exact authcode PKCE contract and handles 204 revoke', async () => {
  const calls = [];
  const p = createWorkosBusinessProvider(
    { clientId: 'client_business', apiKey: 'sk_' + 's'.repeat(32) },
    async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/revoke')) return new Response(null, { status: 204 });
      return Response.json({
        user: { id: 'user_business', email_verified: true },
        access_token: 'access',
        refresh_token: 'refresh',
      });
    },
  );
  const u = new URL(
    p.authorizationUrl({
      state: 's',
      challenge: 'c',
      redirectUri: origin + '/auth/callback',
      signup: false,
    }),
  );
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('provider'), 'authkit');
  await p.exchange('code', 'verifier', new AbortController().signal);
  assert.equal(JSON.parse(calls[0].options.body).code_verifier, 'verifier');
  assert.equal(calls[0].options.redirect, 'error');
  await p.revoke('session_business', new AbortController().signal);
  assert.equal(calls.length, 2);
});
test('browser same-origin GET works without a forbidden Origin header', async () => {
  const f = fixture(),
    s = await f.login();
  assert.equal(
    (
      await f.req('/api/session', {
        cookies: s.cookies,
        omitOrigin: true,
        headers: { 'sec-fetch-site': 'same-origin' },
      })
    ).status,
    200,
  );
  assert.equal((await f.req('/api/session', { cookies: s.cookies, omitOrigin: true })).status, 403);
});
test('existing session must log out before another login can start', async () => {
  const f = fixture(),
    s = await f.login();
  assert.equal(
    (await f.req('/auth/start', { method: 'POST', cookies: s.cookies, data: { signup: false } }))
      .status,
    409,
  );
});
function browser(f, cookies) {
  return createBusinessBrowserClient(
    { origin, realm: 'business', enabled: true },
    async (url, options) => {
      assert.equal(options.credentials, 'same-origin');
      assert.equal(options.cache, 'no-store');
      assert.ok(!options.headers.Authorization && !options.headers.authorization);
      const h = new Headers(options.headers);
      h.set('cookie', cookies);
      h.set('sec-fetch-site', 'same-origin');
      if (options.method === 'POST') h.set('origin', origin);
      return f.handler(new Request(url, { ...options, headers: h }));
    },
  );
}
test('browser client restores an opaque session and reuses existing application controller', async () => {
  const f = fixture(),
    s = await f.login(),
    client = browser(f, s.cookies);
  let application = {
    id: 'application1',
    state: 'draft',
    revision: 1,
    details: { brand_name: 'Example' },
  };
  f.application.read = async () => application;
  f.application.command = async (actor, body) => {
    assert.equal(body.p_action, 'submit');
    assert.equal(body.p_revision, 1);
    assert.match(body.p_request_id, /^[a-f0-9-]{36}$/);
    application = { ...application, state: 'pending', revision: 2, details: body.p_details };
    return { application };
  };
  assert.equal(await client.restore(), true);
  const controller = createApplicationController(client, () => {});
  await controller.load();
  assert.equal(controller.snapshot().application.details.brand_name, 'Example');
  controller.edit('brand_name', 'Updated');
  await controller.command('submit', 'terms-v1', 'privacy-v1');
  assert.equal(controller.snapshot().application.state, 'pending');
  assert.equal(controller.snapshot().dirty, false);
  await client.signout();
  assert.equal(client.hasSession(), false);
  assert.equal(controller.snapshot().application, null);
  assert.equal(f.sessions.size, 0);
  controller.destroy();
});
test('browser blocks malformed successful read instead of displaying an empty application', async () => {
  let count = 0;
  const client = createBusinessBrowserClient(
    { origin, realm: 'business', enabled: true },
    async () =>
      ++count === 1
        ? Response.json({ signedIn: true, csrf: 'x'.repeat(43), assurance: 'aal1' })
        : new Response('{broken'),
  );
  await client.restore();
  await assert.rejects(() => client.read(), /could not be read/);
});
test('browser response from before logout cannot repopulate protected data', async () => {
  let finish;
  const pending = new Promise((r) => (finish = r));
  let count = 0;
  const client = createBusinessBrowserClient(
    { origin, realm: 'business', enabled: true },
    async (url) => {
      if (url.endsWith('/auth/logout'))
        return Response.json({ signedIn: false, remoteConfirmed: true });
      if (++count === 1)
        return Response.json({ signedIn: true, csrf: 'x'.repeat(43), assurance: 'aal1' });
      return pending;
    },
  );
  await client.restore();
  const reading = client.read();
  await client.signout();
  finish(Response.json({ state: 'draft' }));
  await assert.rejects(() => reading, /session has ended/);
  assert.equal(client.hasSession(), false);
});
test('browser maps revision conflicts without dropping draft or changing retry key', async () => {
  const f = fixture(),
    s = await f.login(),
    client = browser(f, s.cookies);
  await client.restore();
  const keys = [];
  f.application.command = async (a, b) => {
    keys.push(b.p_request_id);
    throw Object.assign(Error('Conflict'), { status: 409 });
  };
  const c = createApplicationController(client, () => {});
  await c.load();
  c.edit('brand_name', 'My draft');
  await c.command('save');
  assert.equal(c.snapshot().stale, true);
  assert.equal(c.snapshot().draft.brand_name, 'My draft');
  assert.equal(client.hasSession(), true);
  c.destroy();
});
test('browser coalesces session restore and denies arbitrary redirect destinations', async () => {
  let reads = 0;
  const client = createBusinessBrowserClient(
    { origin, realm: 'business', enabled: true },
    async (url) => {
      reads++;
      return url.endsWith('/api/session')
        ? Response.json({ signedIn: true, csrf: 'x'.repeat(43), assurance: 'aal1' })
        : Response.json({ authorizationUrl: 'https://evil.test' });
    },
  );
  await Promise.all([client.restore(), client.restore()]);
  assert.equal(reads, 1);
  client.clear();
  await assert.rejects(() => client.signin(), /destination could not/);
});
test('database adapter uses one atomic command, parameterized identity, and dedicated registrar', async () => {
  const calls = [];
  const adapter = createBusinessApplicationAdapter(async (...args) => {
    calls.push(args);
    return null;
  });
  const f = fixture();
  const command = {
    p_action: 'save',
    p_revision: null,
    p_details: { brand_name: "O'Reilly" },
    p_terms_version: null,
    p_privacy_version: null,
    p_request_id: '87000000-0000-4000-8000-000000000001',
  };
  await adapter.command(f.actor, command, new AbortController().signal);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'doji_identity_resolver');
  assert.doesNotMatch(calls[0][1], /O'Reilly|user_business/);
  assert.equal(calls[0][2][2], 'user_business');
  await adapter.enroll(f.actor, signup, new AbortController().signal);
  assert.equal(calls[1][0], 'doji_business_enrollment');
  assert.throws(() => adapter.command(f.actor, { ...command, principal_id: 'attacker' }));
  assert.throws(() => adapter.command({ ...f.actor, realm: 'employee' }, command));
});
test('database errors retain safe status without private SQL details', async () => {
  const f = fixture();
  for (const [code, status] of [
    ['42501', 403],
    ['PT409', 409],
    ['22023', 400],
    ['XX000', 503],
  ]) {
    const adapter = createBusinessApplicationAdapter(async () => {
      throw Object.assign(Error('PRIVATE SQL CONTENT'), { code });
    });
    await assert.rejects(
      () => adapter.read(f.actor, new AbortController().signal),
      (e) => e.status === status && !e.message.includes('PRIVATE'),
    );
  }
});
