// Offline only: synthetic same-origin HTTP responses; no provider, database,
// browser storage, member session, or privileged command is contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmployeeBrowserTransport } from '../infra/portal-identity-candidate/employee-browser-transport.mjs';
const origin = 'https://admin.dojipro.com';
const csrf = 'c'.repeat(43);
const operator = { user_id: 'synthetic-employee' };
const authenticated = { signedIn: true, assurance: 'aal2', csrf, operator };
const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function fixture(overrides = {}) {
  const calls = [],
    invalidated = [],
    replies = [];
  let time = 1_000_000;
  const client = createEmployeeBrowserTransport(
    {
      independentEmployeeIdentity: true,
      businessApplicationsEnabled: true,
      businessPrivacyEnabled: true,
      onAccessInvalidated: (message) => invalidated.push(message),
      ...overrides,
    },
    {
      origin,
      now: () => time,
      upstream: async (url, init) => {
        calls.push({ url, ...init });
        if (replies.length) {
          const next = replies.shift();
          return typeof next === 'function' ? next() : next;
        }
        return response(
          url.endsWith('/api/session')
            ? authenticated
            : url.endsWith('/auth/logout')
              ? { signedIn: false }
              : { ok: true },
        );
      },
    },
  );
  return {
    client,
    calls,
    invalidated,
    replies,
    advance: (ms) => {
      time += ms;
    },
  };
}
test('transport refuses a nonemployee origin and disabled identity configuration', () => {
  for (const [config, host] of [
    [{}, origin],
    [{ independentEmployeeIdentity: true }, 'https://business.dojipro.com'],
  ]) {
    assert.throws(
      () =>
        createEmployeeBrowserTransport(config, {
          origin: host,
          upstream: () => {
            throw Error('must not fetch');
          },
        }),
      { status: 503 },
    );
  }
});
test('session restore installs MFA identity using only same-origin no-store cookies', async () => {
  const f = fixture();
  assert.equal(f.client.hasSession(), false);
  assert.throws(() => f.client.assertSessionFresh(), { status: 401 });
  assert.deepEqual(await f.client.request('/portal/admin/session'), operator);
  assert.equal(f.client.hasSession(), true);
  assert.equal(f.client.noteActivity(), true);
  f.client.assertSessionFresh();
  assert.equal(f.calls[0].url, origin + '/api/session');
  assert.equal(f.calls[0].credentials, 'same-origin');
  assert.equal(f.calls[0].cache, 'no-store');
  assert.equal(f.calls[0].redirect, 'error');
  assert.deepEqual(f.calls[0].headers, {});
  assert.equal(f.calls[0].method, 'GET');
});
for (const patch of [
  { signedIn: false },
  { assurance: 'aal1' },
  { csrf: 'short' },
  { operator: {} },
]) {
  test(`malformed successful session is denied: ${JSON.stringify(patch)}`, async () => {
    const f = fixture();
    f.replies.push(response({ ...authenticated, ...patch }));
    await assert.rejects(f.client.session(), { status: 401 });
    assert.equal(f.client.hasSession(), false);
    assert.equal(f.invalidated.length, 1);
  });
}
test('password step cannot enter workspace before exact TOTP completion', async () => {
  const f = fixture();
  f.replies.push(response({ step: 'totp', csrf }));
  assert.deepEqual(await f.client.signIn('employee@example.test', 'synthetic-password'), {
    requiresChallenge: true,
    method: 'totp',
  });
  assert.equal(f.client.hasSession(), false);
  assert.deepEqual(f.calls[0].headers, { 'content-type': 'application/json' });
  f.replies.push(response(authenticated));
  assert.deepEqual(await f.client.verifyPendingChallenge('123456'), { authenticated: true });
  assert.equal(f.calls[1].headers['x-doji-csrf'], csrf);
  assert.deepEqual(JSON.parse(f.calls[1].body), { code: '123456' });
  assert.equal(f.client.hasSession(), true);
});
test('enrollment requires valid bound PNG and Base32 secret and is cleared after completion', async () => {
  const f = fixture();
  await assert.rejects(f.client.enrollTotp(), { status: 401 });
  const enrollmentQr = 'data:image/png;base64,iVBORabc123==',
    enrollmentSecret = 'ABCDEFGH23456789'.replaceAll('8', 'A').replaceAll('9', 'B');
  f.replies.push(
    response({ step: 'totp', csrf, enrollmentRequired: true, enrollmentQr, enrollmentSecret }),
  );
  assert.deepEqual(await f.client.signIn('employee@example.test', 'synthetic'), {
    requiresEnrollment: true,
    methods: { totp: true, phone: false },
  });
  assert.deepEqual(await f.client.enrollTotp(), { qrCode: enrollmentQr, secret: enrollmentSecret });
  f.replies.push(response(authenticated));
  await f.client.verifyTotpEnrollment('123456');
  await assert.rejects(f.client.enrollTotp(), { status: 401 });
});
for (const patch of [{ step: 'password' }, { csrf: 'invalid' }])
  test(`invalid start response ${JSON.stringify(patch)} cannot progress`, async () => {
    const f = fixture();
    f.replies.push(response({ step: 'totp', csrf, ...patch }));
    await assert.rejects(f.client.signIn('e@example.test', 'synthetic'), { status: 401 });
    await assert.rejects(f.client.verifyPendingChallenge('123456'), { status: 401 });
    assert.equal(f.calls.length, 1);
  });
test('invalid enrollment material is rejected even after a valid pending step', async () => {
  for (const patch of [
    { enrollmentQr: 'https://elsewhere.test/qr' },
    { enrollmentSecret: 'invalid' },
  ]) {
    const f = fixture();
    f.replies.push(
      response({
        step: 'totp',
        csrf,
        enrollmentRequired: true,
        enrollmentQr: 'data:image/png;base64,iVBORabc=',
        enrollmentSecret: 'A'.repeat(16),
        ...patch,
      }),
    );
    await f.client.signIn('e@example.test', 'synthetic');
    await assert.rejects(f.client.enrollTotp(), { status: 401 });
  }
});
test('invalid JSON and server errors never install a session', async () => {
  for (const reply of [
    {
      ok: true,
      json: async () => {
        throw Error('parse');
      },
    },
    response({}, 503),
    response({ message: 'Temporarily unavailable' }, 503),
  ]) {
    const f = fixture();
    f.replies.push(reply);
    await assert.rejects(f.client.session(), { status: 503 });
    assert.equal(f.client.hasSession(), false);
  }
});
test('same-origin mappings send exact RPC and CSRF, without a browser bearer token', async () => {
  const f = fixture();
  await f.client.session();
  await f.client.request('/portal/admin/realtime-token');
  await f.client.request('/portal/admin/platform-health');
  await f.client.request('/business/item', { method: 'POST', body: { id: 'exact' } });
  await f.client.request('/business-privacy/case', { method: 'POST', body: { p_case_id: 'case' } });
  assert.deepEqual(
    f.calls.slice(1).map((c) => JSON.parse(c.body)),
    [
      { name: 'portal_realtime_token_v1', args: {} },
      { name: 'portal_platform_health_v1', args: {} },
      { name: 'get_admin_business_application_v1', args: { id: 'exact' } },
      { name: 'get_admin_business_privacy_case_v1', args: { p_case_id: 'case' } },
    ],
  );
  for (const call of f.calls.slice(1))
    assert.deepEqual(call.headers, { 'content-type': 'application/json', 'x-doji-csrf': csrf });
});
test('disabled features, wrong methods and foreign destinations fail before RPC', async () => {
  const f = fixture({ businessApplicationsEnabled: false, businessPrivacyEnabled: false });
  await f.client.session();
  for (const [path, options, status] of [
    ['/business/item', {}, 400],
    ['/business/item', { method: 'POST' }, 403],
    ['/business-privacy/case', { method: 'POST' }, 403],
    ['https://attacker.test/read', {}, 400],
    ['/not-an-operation', {}, 404],
  ])
    await assert.rejects(f.client.request(path, options), { status });
  assert.equal(f.calls.length, 1);
});
test('legacy route names map to employee-only directory and role commands', async () => {
  const f = fixture();
  await f.client.session();
  await f.client.request('/portal/admin/operators');
  await f.client.request('/portal/admin/operator-role', {
    method: 'POST',
    body: {
      username: 'synthetic',
      role: 'moderator',
      active: true,
      reason: 'test',
      idempotencyKey: 'exact-receipt',
    },
  });
  await f.client.request('/portal/admin/platform-health-history?limit=5');
  await assert.rejects(f.client.request('/portal/admin/operators', { method: 'POST' }), {
    status: 404,
  });
  assert.deepEqual(
    f.calls.slice(1).map((c) => JSON.parse(c.body)),
    [
      { name: 'get_admin_employee_directory_v1', args: {} },
      {
        name: 'admin_set_employee_role_v1',
        args: {
          p_username: 'synthetic',
          p_role: 'moderator',
          p_active: true,
          p_reason: 'test',
          p_idempotency_key: 'exact-receipt',
        },
      },
      { name: 'get_admin_event_health_history_v1', args: { p_limit: 5 } },
    ],
  );
});
test('item-level denial rechecks employee session once and never repeats the rejected command', async () => {
  const f = fixture();
  await f.client.session();
  f.replies.push(response({ message: 'Case denied' }, 403));
  await assert.rejects(
    f.client.request('/safety/command', { method: 'POST', body: { case: 'restricted' } }),
    { status: 403 },
  );
  assert.equal(f.client.hasSession(), true);
  assert.equal(f.invalidated.length, 0);
  assert.deepEqual(
    f.calls.map((c) => c.url.slice(origin.length)),
    ['/api/session', '/api/rpc', '/api/session'],
  );
});
test('unverifiable access after a denied case clears the workspace', async () => {
  const f = fixture();
  await f.client.session();
  f.replies.push(response({}, 403), response({}, 503));
  await assert.rejects(f.client.request('/safety/case', { method: 'POST' }), { status: 403 });
  assert.equal(f.client.hasSession(), false);
  assert.equal(f.invalidated.length, 1);
});
test('local activity cannot extend idle expiry; successful authorized reads can', async () => {
  const f = fixture();
  await f.client.session();
  f.advance(1799999);
  assert.equal(f.client.noteActivity(), true);
  await f.client.request('/portal/admin/platform-health');
  f.advance(1799999);
  assert.equal(f.client.hasSession(), true);
  f.advance(1);
  assert.equal(f.client.noteActivity(), false);
  await assert.rejects(f.client.request('/portal/admin/platform-health'), { status: 401 });
  assert.equal(f.calls.length, 2);
});
test('absolute expiry still applies despite regular session restoration', async () => {
  const f = fixture();
  await f.client.session();
  for (let i = 0; i < 16; i++) {
    f.advance(1700000);
    await f.client.session();
  }
  f.advance(1600000);
  assert.equal(f.client.hasSession(), false);
});
test('logout fences in-flight and queued reads and uses late session CSRF only for cleanup', async () => {
  const f = fixture(),
    started = deferred(),
    done = deferred();
  f.replies.push(() => {
    started.resolve();
    return done.promise;
  });
  const restore = f.client.session();
  const rejectedRestore = assert.rejects(restore, { status: 401 });
  await started.promise;
  const queued = f.client.request('/portal/admin/platform-health');
  const rejectedQueued = assert.rejects(queued, { status: 401 });
  const logout = f.client.signOut();
  done.resolve(response(authenticated));
  await Promise.all([rejectedRestore, rejectedQueued, logout]);
  assert.equal(f.client.hasSession(), false);
  assert.deepEqual(
    f.calls.map((c) => c.url.slice(origin.length)),
    ['/api/session', '/auth/logout'],
  );
  assert.equal(f.calls[1].headers['x-doji-csrf'], csrf);
});
test('logout confirms server result, leaves local state locked on failure and can retry cleanup', async () => {
  const f = fixture();
  await f.client.session();
  f.replies.push(response({ signedIn: true }));
  await assert.rejects(f.client.signOut(), { status: 503 });
  assert.equal(f.client.hasSession(), false);
  await f.client.signOut();
  const count = f.calls.length;
  await f.client.signOut();
  assert.equal(f.calls.length, count);
});
test('clearSession reports cleanup failure without preserving local workspace access', async () => {
  const invalidated = deferred();
  const f = fixture({ onAccessInvalidated: (message) => invalidated.resolve(message) });
  await f.client.session();
  f.replies.push(response({}, 503));
  f.client.clearSession();
  assert.equal(f.client.hasSession(), false);
  assert.match(await invalidated.promise, /server sign-out could not be confirmed/);
});
test('evidence calls require both identifiers and return only the signed URL result', async () => {
  const f = fixture();
  await f.client.session();
  assert.equal(await f.client.signEvidence('', 'path'), null);
  assert.equal(await f.client.signEvidence('bucket', ''), null);
  f.replies.push(response({ signedUrl: 'https://synthetic.invalid/exact' }));
  assert.equal(
    await f.client.signEvidence('post-media', 'exact/path'),
    'https://synthetic.invalid/exact',
  );
  assert.deepEqual(JSON.parse(f.calls[1].body), {
    name: 'portal_sign_evidence_v1',
    args: { bucket: 'post-media', path: 'exact/path' },
  });
});
