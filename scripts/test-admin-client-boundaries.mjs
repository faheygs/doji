// Actual portal client, synthetic browser storage/HTTP/provider boundaries only.
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

globalThis.window = {};
await import('../website/admin-portal/live-client.js');
const { create } = window.DojiAdminPortalClient;
const storageKey = 'doji-admin-session-v1';
const config = {
  supabaseUrl: 'https://database.invalid/',
  apiBaseUrl: 'https://api.invalid/',
  supabaseAnonKey: 'synthetic-public-key',
};
const jwt = (aal = 'aal2', role = 'authenticated') =>
  `header.${Buffer.from(JSON.stringify({ aal, role })).toString('base64url')}.synthetic`;
const auth = (patch = {}) => ({
  access_token: jwt(),
  refresh_token: 'synthetic-refresh',
  expires_in: 3600,
  user: { id: 'employee-a' },
  ...patch,
});
const json = (body, status = 200) =>
  new Response(body == null ? null : JSON.stringify(body), { status });
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
let values, requests;
beforeEach((t) => {
  values = new Map();
  requests = [];
  globalThis.sessionStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  delete window.Ably;
  delete window.DojiEmployeeTransport;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    throw Error(`Unexpected synthetic request: ${url}`);
  });
});
function transport(t, responder) {
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    requests.push({ url, options });
    return responder(url, options);
  });
}
function restored(patch = {}, options = {}) {
  values.set(
    storageKey,
    JSON.stringify(auth({ expires_at: Math.floor(Date.now() / 1000) + 3600, ...patch })),
  );
  return create({ ...config, ...options });
}

for (const patch of [
  { supabaseUrl: '' },
  { apiBaseUrl: '' },
  { supabaseAnonKey: '' },
  { independentEmployeeIdentity: true },
  { independentEmployeeIdentity: true, employeeAccountsEnabled: true },
]) {
  test(`missing configuration fails closed: ${JSON.stringify(patch)}`, () => {
    assert.throws(() => create({ ...config, ...patch }), /configuration|connection/);
    assert.equal(requests.length, 0);
  });
}
test('malformed storage and signed-out operations cannot start requests', async () => {
  values.set(storageKey, '{bad');
  const client = create(config);
  assert.equal(client.hasSession(), false);
  assert.equal(client.noteActivity(), false);
  await assert.rejects(client.session(), /Sign in/);
  await assert.rejects(client.enrollTotp(), /Sign in/);
  await assert.rejects(client.verifyPendingChallenge('123456'), /Start/);
  await assert.rejects(client.verifyTotpEnrollment('123456'), /Choose/);
  await client.signOut();
  assert.equal(requests.length, 0);
});
test('restoration fills timestamps without touching member storage; activity is throttled', (t) => {
  let now = 1000000000;
  t.mock.method(Date, 'now', () => now);
  values.set('member-session', 'unchanged');
  const client = restored();
  assert.equal(client.hasSession(), true);
  assert.deepEqual(client.sessionPolicy(), { idleTimeoutMs: 1800000, absoluteTimeoutMs: 28800000 });
  const initial = values.get(storageKey);
  now += 29999;
  assert.equal(client.noteActivity(), true);
  assert.equal(values.get(storageKey), initial);
  now++;
  assert.equal(client.noteActivity(), true);
  assert.equal(JSON.parse(values.get(storageKey)).last_activity_at, now);
  client.clearSession();
  assert.equal(values.get('member-session'), 'unchanged');
  assert.equal(values.has(storageKey), false);
});
for (const kind of ['idle', 'absolute'])
  test(`${kind} expiry refuses reads and erases only portal state`, async (t) => {
    const now = 1000000000;
    t.mock.method(Date, 'now', () => now);
    const client = restored({
      started_at: now - (kind === 'absolute' ? 28800001 : 1000),
      last_activity_at: now - (kind === 'idle' ? 1800001 : 1000),
    });
    assert.equal(client.hasSession(), false);
    assert.equal(client.noteActivity(), false);
    await assert.rejects(client.commandCenter(), /expired/);
    assert.equal(values.has(storageKey), false);
    assert.equal(requests.length, 0);
  });
test('restored personal token is not an employee session', () =>
  assert.equal(restored({}, { employeeAccountsEnabled: true }).hasSession(), false));
test('missing refresh credential never starts token rotation', async () => {
  const client = restored({ refresh_token: null, expires_at: 1 });
  assert.equal(client.hasSession(), false);
  await assert.rejects(client.commandCenter(), /expired/);
  assert.equal(requests.length, 0);
});
for (const [body, expected] of [
  [{ msg: 'Message one' }, 'Message one'],
  [{ message: 'Message two' }, 'Message two'],
  [{ error_description: 'Description' }, 'Description'],
  [{ error: 'Error value' }, 'Error value'],
  [null, 'Authentication failed.'],
]) {
  test(`authentication HTTP errors preserve safe protocol error: ${expected}`, async (t) => {
    transport(t, () => json(body, 400));
    await assert.rejects(
      create(config).signIn('work@example.test', 'synthetic'),
      (error) => error.status === 400 && error.message === expected,
    );
  });
}
for (const enabled of [false, true])
  test(`registration feature gate ${enabled}`, async (t) => {
    transport(t, () => json({ received: true }));
    const client = create({ ...config, employeeAccountsEnabled: enabled });
    if (!enabled) {
      await assert.rejects(
        client.registerEmployee('Name', 'work@example.test', 'synthetic'),
        /not enabled/,
      );
      await assert.rejects(client.resendEmployeeVerification('work@example.test'), /not enabled/);
      assert.equal(requests.length, 0);
      return;
    }
    assert.deepEqual(await client.registerEmployee('Name', 'work@example.test', 'synthetic'), {
      received: true,
    });
    await client.resendEmployeeVerification('work@example.test');
    assert.deepEqual(
      requests.map((r) => JSON.parse(r.options.body)),
      [
        { displayName: 'Name', email: 'work@example.test', password: 'synthetic' },
        { action: 'resend_verification', email: 'work@example.test' },
      ],
    );
    assert(requests.every((r) => r.url.endsWith('/employee-register') && r.options.signal));
    assert.equal(client.hasSession(), false);
  });
for (const status of ['pending', 'disabled'])
  test(`employee ${status} fails before MFA and revokes only new local login`, async (t) => {
    transport(t, (url) =>
      url.endsWith('employee-signin')
        ? json(auth({ access_token: jwt('aal1', 'doji_employee') }))
        : url.endsWith('get_employee_registration_status_v1')
          ? json({ status })
          : json(null, 204),
    );
    const client = create({ ...config, employeeAccountsEnabled: true });
    await assert.rejects(
      client.signIn('work@example.test', 'synthetic'),
      status === 'pending' ? /approval/ : /disabled/,
    );
    assert.equal(client.hasSession(), false);
    assert(requests.at(-1).url.endsWith('/logout?scope=local'));
    assert.equal(requests.length, 3);
  });
for (const employeeMode of [true, false])
  test(`wrong login realm fails before MFA (employee mode ${employeeMode})`, async (t) => {
    transport(t, (url) =>
      url.includes('logout')
        ? Promise.reject(Error('Synthetic logout unavailable'))
        : json(
            auth({ access_token: jwt('aal1', employeeMode ? 'authenticated' : 'doji_employee') }),
          ),
    );
    const client = create({ ...config, employeeAccountsEnabled: employeeMode });
    await assert.rejects(
      client.signIn('work@example.test', 'synthetic'),
      /separate employee|Employee setup/,
    );
    assert.equal(client.hasSession(), false);
    assert.equal(requests.length, 2);
    assert(requests[1].url.endsWith('scope=local'));
  });
for (const factor of [
  { id: 'totp/id', factor_type: 'totp', status: 'verified' },
  { id: 'phone/id', type: 'phone', status: 'verified', phone: '+10000000000' },
]) {
  test(`existing ${factor.factor_type || factor.type} factor challenges and verifies exact factor`, async (t) => {
    transport(t, (url) =>
      url.includes('grant_type=password')
        ? json(auth({ access_token: jwt('aal1'), user: { id: 'employee-a', factors: [factor] } }))
        : url.endsWith('/challenge')
          ? json({ id: 'challenge-a' })
          : json(auth()),
    );
    const client = create(config);
    const result = await client.signIn('work@example.test', 'synthetic');
    assert.equal(result.requiresChallenge, true);
    assert.equal(result.method, factor.factor_type || factor.type);
    await assert.rejects(client.verifyPendingChallenge('no'), /six-digit/);
    await client.verifyPendingChallenge(' 123456 ');
    assert.equal(client.hasSession(), true);
    assert.equal(requests.filter((r) => r.url.endsWith('/challenge')).length, 1);
    const last = requests.at(-1);
    assert(last.url.includes(encodeURIComponent(factor.id)));
    assert.deepEqual(JSON.parse(last.options.body), {
      challenge_id: 'challenge-a',
      code: '123456',
    });
    await assert.rejects(client.verifyPendingChallenge('123456'), /Start/);
  });
}
for (const [enrollment, message] of [
  [{ type: 'phone' }, /wrong/],
  [{ type: 'totp', totp: {} }, /QR code/],
  [{ type: 'totp', totp: { qr_code: '<svg/>' } }, /setup key/],
]) {
  test(`invalid authenticator enrollment: ${JSON.stringify(enrollment)}`, async (t) => {
    transport(t, (url) =>
      url.includes('password')
        ? json(auth({ access_token: 'malformed', user: {} }))
        : json(enrollment),
    );
    const client = create(config);
    assert.equal((await client.signIn('work@example.test', 'synthetic')).requiresEnrollment, true);
    await assert.rejects(client.enrollTotp(), message);
    assert.equal(client.hasSession(), false);
  });
}
test('enrollment removes only unverified TOTP and low assurance cannot finish; retry reuses pending challenge', async (t) => {
  let verified = false;
  transport(t, (url, options) => {
    if (url.includes('password'))
      return json(
        auth({
          access_token: jwt('aal1'),
          user: {
            id: 'employee-a',
            factors: [
              { id: 'stale/id', type: 'totp', status: 'unverified' },
              { id: 'passkey', type: 'webauthn' },
            ],
          },
        }),
      );
    if (options.method === 'DELETE') return json(null, 204);
    if (url.endsWith('/factors'))
      return json({ id: 'factor', type: 'totp', totp: { qr_code: '', secret: 'SYNTHETIC' } });
    if (url.endsWith('/challenge')) return json({ id: 'challenge' });
    return json(auth({ access_token: jwt(verified ? 'aal2' : 'aal1') }));
  });
  const client = create(config);
  await client.signIn('work@example.test', 'synthetic');
  assert.equal((await client.enrollTotp()).qrCode, '');
  assert.deepEqual(
    requests.filter((r) => r.options.method === 'DELETE').map((r) => r.url),
    ['https://database.invalid/auth/v1/factors/stale%2Fid'],
  );
  await assert.rejects(client.verifyTotpEnrollment('123456'), /assurance/);
  assert.equal(client.hasSession(), false);
  verified = true;
  await client.verifyTotpEnrollment('123456');
  assert.equal(client.hasSession(), true);
  assert.equal(requests.filter((r) => r.url.endsWith('/challenge')).length, 1);
});
test('employee assurance response cannot turn into a personal-account session', async (t) => {
  transport(t, (url) =>
    url.endsWith('employee-signin')
      ? json(
          auth({
            access_token: jwt('aal1', 'doji_employee'),
            user: {
              id: 'employee-a',
              factors: [{ id: 'factor', type: 'totp', status: 'verified' }],
            },
          }),
        )
      : url.endsWith('get_employee_registration_status_v1')
        ? json({ status: 'active' })
        : url.endsWith('challenge')
          ? json({ id: 'challenge' })
          : json(auth()),
  );
  const client = create({ ...config, employeeAccountsEnabled: true });
  await client.signIn('work@example.test', 'synthetic');
  await assert.rejects(client.verifyPendingChallenge('123456'), /separate employee/);
  assert.equal(client.hasSession(), false);
  assert.equal(values.has(storageKey), false);
});
for (const phase of ['password', 'employee-status', 'refresh', 'read', 'read-body'])
  test(`late ${phase} cannot restore a cleared portal session`, async (t) => {
    const started = deferred(),
      finish = deferred();
    transport(t, async (url) => {
      if (url.endsWith('employee-signin'))
        return json(auth({ access_token: jwt('aal2', 'doji_employee') }));
      if (phase === 'read-body')
        return {
          ok: true,
          status: 200,
          text: () => {
            started.resolve();
            return finish.promise;
          },
        };
      started.resolve();
      return finish.promise;
    });
    const client =
      phase === 'password' || phase === 'employee-status'
        ? create({ ...config, employeeAccountsEnabled: phase === 'employee-status' })
        : restored(phase === 'refresh' ? { expires_at: 1 } : {});
    const pending =
      phase === 'password' || phase === 'employee-status'
        ? client.signIn('work@example.test', 'synthetic')
        : client.commandCenter();
    const rejected = assert.rejects(pending, /session changed/);
    await started.promise;
    client.clearSession();
    finish.resolve(
      phase === 'read-body'
        ? '{}'
        : json(phase === 'employee-status' ? { status: 'active' } : auth()),
    );
    await rejected;
    assert.equal(client.hasSession(), false);
    assert.equal(values.has(storageKey), false);
  });
test('401 retries once using refreshed credentials and concurrent reads share rotation', async (t) => {
  const started = deferred(),
    finish = deferred();
  let rotations = 0;
  transport(t, async (url, options) => {
    if (url.includes('refresh_token')) {
      rotations++;
      started.resolve();
      await finish.promise;
      return json(auth({ access_token: 'rotated-token' }));
    }
    return options.headers.authorization === 'Bearer rotated-token'
      ? json({ ok: true })
      : json({}, 401);
  });
  const client = restored();
  const first = client.commandCenter();
  await started.promise;
  const second = client.platformHealth();
  await Promise.resolve();
  finish.resolve();
  assert.deepEqual(await Promise.all([first, second]), [{ ok: true }, { ok: true }]);
  assert.equal(rotations, 1);
  assert.equal(client.hasSession(), true);
});
test('case denial rechecks capabilities without retrying the denied write or revoking valid employee', async (t) => {
  transport(t, (url) =>
    url.endsWith('/session')
      ? json({
          user_id: 'employee-a',
          roles: ['moderator'],
          capabilities: { moderation_read: true },
        })
      : json({ message: 'Case unavailable' }, 403),
  );
  const client = restored();
  await assert.rejects(
    client.decideReport({ idempotencyKey: 'same-intent' }),
    (error) => error.status === 403 && error.message === 'Case unavailable',
  );
  assert.equal(client.hasSession(), true);
  assert.equal(requests.length, 2);
  assert.equal(requests.filter((r) => r.url.endsWith('report-decision')).length, 1);
});
for (const status of [401, 403, 503])
  test(`authoritative access failure ${status} after case denial clears the workspace`, async (t) => {
    const invalidated = [];
    transport(t, (url) =>
      url.includes('refresh_token')
        ? json(auth())
        : url.endsWith('/session')
          ? json({ message: 'Access unavailable' }, status)
          : json({}, 403),
    );
    const client = restored({}, { onAccessInvalidated: (m) => invalidated.push(m) });
    await assert.rejects(client.reportCase('report'), /Access unavailable/);
    assert.equal(client.hasSession(), false);
    assert.equal(invalidated.length, 1);
  });
test('session verification coalesces reads, canonicalizes permissions and invalidates actual permission changes', async (t) => {
  let result = {
    user_id: 'employee-a',
    roles: ['admin', 'moderator'],
    capabilities: { b: false, a: true },
  };
  transport(t, () => json(result));
  const invalidated = [];
  const client = restored({}, { onAccessInvalidated: (m) => invalidated.push(m) });
  await Promise.all([client.session(), client.session()]);
  assert.equal(requests.length, 1);
  result = { ...result, roles: ['moderator', 'admin'], capabilities: { a: true, b: false } };
  await client.session();
  assert.equal(client.hasSession(), true);
  result = { ...result, roles: ['moderator'] };
  await assert.rejects(client.session(), /permissions changed/);
  assert.equal(client.hasSession(), false);
  assert.equal(invalidated.length, 1);
});
for (const [bucket, path] of [
  ['unknown', 'photo'],
  ['post-media', '../photo'],
  ['post-media', '/photo'],
  ['post-media', 'x//y'],
  ['moderation-evidence', 'not-a-snapshot'],
])
  test(`invalid evidence ${bucket}:${path} never contacts storage`, async () => {
    await assert.rejects(restored().signEvidence(bucket, path), /Invalid evidence/);
    assert.equal(requests.length, 0);
  });
for (const signed of [
  '/object/sign/post-media/folder/photo?token=synthetic',
  '/storage/v1/object/sign/post-media/folder/photo?token=synthetic',
  'https://database.invalid/storage/v1/object/sign/post-media/folder/photo?token=synthetic',
])
  test(`evidence URL normalization ${signed}`, async (t) => {
    transport(t, () => json({ signedUrl: signed }));
    const client = restored();
    assert.equal(await client.signEvidence(null, null), null);
    assert.equal(
      await client.signEvidence('post-media', 'folder/a b.jpg'),
      'https://database.invalid/storage/v1/object/sign/post-media/folder/photo?token=synthetic',
    );
    assert(requests[0].url.endsWith('folder/a%20b.jpg'));
    assert.deepEqual(JSON.parse(requests[0].options.body), { expiresIn: 300 });
  });
for (const signedURL of [
  null,
  'https://other.invalid/storage/v1/object/sign/post-media/file',
  '/object/sign/avatars/file',
])
  test(`evidence rejects missing or foreign signer result ${signedURL}`, async (t) => {
    transport(t, () => json({ signedURL }));
    await assert.rejects(
      restored().signEvidence('post-media', 'file'),
      /not returned|did not match/,
    );
  });
test('evidence renews once on 401 and refuses late signed response after logout', async (t) => {
  let count = 0;
  const started = deferred(),
    finish = deferred();
  transport(t, async (url) => {
    if (url.includes('refresh_token')) return json(auth());
    if (++count === 1) return json({}, 401);
    started.resolve();
    await finish.promise;
    return json({ signedURL: '/object/sign/avatars/file' });
  });
  const client = restored();
  const pending = client.signEvidence('avatars', 'file');
  const rejected = assert.rejects(pending, /session changed/);
  await started.promise;
  client.clearSession();
  finish.resolve();
  await rejected;
  assert.equal(count, 2);
});

const routes = [
  ['businessPage', [{ p_limit: 25 }], '/business/page', { p_limit: 25 }],
  ['businessItem', ['case'], '/business/item', { p_id: 'case' }],
  [
    'businessCommand',
    [{ p_request_id: 'intent' }],
    '/business/command',
    { p_request_id: 'intent' },
  ],
  ...['Page', 'Case', 'Access', 'Correction', 'Open', 'Command'].map((name) => [
    `businessPrivacy${name}`,
    [{ p_case_id: 'case' }],
    `/business-privacy/${name.toLowerCase()}`,
    { p_case_id: 'case' },
  ]),
  [
    'safetyPage',
    [],
    '/safety/page',
    { p_after_at: null, p_after_id: null, p_closed: false, p_queue: 'restricted_safety' },
  ],
  [
    'safetyPage',
    [{ at: 'time', id: 'cursor' }, true, 'moderation'],
    '/safety/page',
    { p_after_at: 'time', p_after_id: 'cursor', p_closed: true, p_queue: 'moderation' },
  ],
  ['safetyCase', ['case'], '/safety/case', { p_id: 'case' }],
  [
    'safetyTarget',
    ['case', 'post', 'post'],
    '/safety/target',
    { p_case_id: 'case', p_kind: 'post', p_target_id: 'post' },
  ],
  ...[
    'safetyCreateReport',
    'safetyCommand',
    'editorialCommand',
    'setOperatorRole',
    'triageReport',
    'setReportReviewState',
    'decideReport',
    'decideAppeal',
  ].map((name, i) => [
    name,
    [{ request: 'unchanged' }],
    [
      '/safety/create-report',
      '/safety/command',
      '/portal/admin/editorial-command',
      '/portal/admin/operator-role',
      '/portal/admin/report-triage',
      '/portal/admin/report-review-state',
      '/portal/admin/report-decision',
      '/portal/admin/appeal-decision',
    ][i],
    { request: 'unchanged' },
  ]),
  [
    'editorialPage',
    ['ideas', { at: 'time', id: 'cursor' }, 'pending'],
    '/portal/admin/editorial-page?kind=ideas&limit=25&filter=pending&beforeAt=time&beforeId=cursor',
  ],
  ['editorialPage', ['ideas'], '/portal/admin/editorial-page?kind=ideas&limit=25&filter=all'],
  ['editorialItem', ['idea', 'a/b'], '/portal/admin/editorial-item?kind=idea&id=a%2Fb'],
  ['commandCenter', [], '/portal/admin/command-center?limit=20'],
  ['platformHealth', [], '/portal/admin/platform-health'],
  ['platformHealthHistory', [], '/portal/admin/platform-health-history?limit=12'],
  ['workQueue', [], '/portal/admin/work-queue?limit=25&queue=all&filter=all'],
  [
    'workQueue',
    [
      { queue: 'safety', filter: 'mine', search: 'a b' },
      { at: 'time', id: 'cursor' },
    ],
    '/portal/admin/work-queue?limit=25&queue=safety&filter=mine&search=a+b&afterAt=time&afterId=cursor',
  ],
  ['auditEvents', [], '/portal/admin/audit?limit=50&category=activity'],
  [
    'auditEvents',
    [10, { occurred_at: 'time', id: 'cursor' }, { category: 'decision', search: 'a b' }],
    '/portal/admin/audit?limit=10&beforeOccurredAt=time&beforeId=cursor&category=decision&search=a+b',
  ],
  ['auditExport', [], '/portal/admin/audit-export?category=activity'],
  [
    'auditExport',
    [{ category: 'decision', search: 'a b' }],
    '/portal/admin/audit-export?category=decision&search=a+b',
  ],
  ['operators', [], '/portal/admin/operators'],
  ['reportCase', ['a/b'], '/portal/admin/report-case-v3?id=a%2Fb'],
  ['appealCase', ['a/b'], '/portal/admin/appeal-case?id=a%2Fb'],
  ['appeals', [], '/portal/admin/appeals?limit=20'],
  ['resolvedReports', [], '/portal/admin/resolved-reports?limit=25'],
  [
    'resolvedReports',
    [10, { resolved_at: 'time', report_id: 'cursor' }],
    '/portal/admin/resolved-reports?limit=10&beforeResolvedAt=time&beforeReportId=cursor',
  ],
];
for (const [method, args, path, body] of routes)
  test(`independent transport preserves exact route and command: ${method} ${path}`, async () => {
    const calls = [];
    window.DojiEmployeeTransport = {
      create: () => ({
        request: async (...args) => {
          calls.push(args);
          return { receipt: 'authoritative' };
        },
      }),
    };
    const client = create({ independentEmployeeIdentity: true, employeeAccountsEnabled: true });
    assert.deepEqual(await client[method](...args), { receipt: 'authoritative' });
    assert.deepEqual(calls, [[path, body === undefined ? {} : { method: 'POST', body }]]);
    assert.equal(requests.length, 0);
  });
test('independent authentication and local cleanup delegate without Supabase or storage use', async () => {
  let providerConfig;
  const calls = [];
  const invalidated = [];
  const adapter = Object.fromEntries(
    [
      'hasSession',
      'noteActivity',
      'signIn',
      'verifyPendingChallenge',
      'enrollTotp',
      'verifyTotpEnrollment',
      'signEvidence',
      'signOut',
      'clearSession',
    ].map((name) => [
      name,
      (...args) => {
        calls.push([name, ...args]);
        return true;
      },
    ]),
  );
  window.DojiEmployeeTransport = {
    create: (cfg) => {
      providerConfig = cfg;
      return adapter;
    },
  };
  values.set(storageKey, 'unrelated-retained-login');
  const client = create({
    independentEmployeeIdentity: true,
    employeeAccountsEnabled: true,
    onAccessInvalidated: (m) => invalidated.push(m),
  });
  assert.equal(client.hasSession(), true);
  assert.equal(client.noteActivity(), true);
  await client.signIn('work@example.test', 'synthetic');
  await client.verifyPendingChallenge('123456');
  await client.enrollTotp();
  await client.verifyTotpEnrollment('123456');
  await client.signEvidence('avatars', 'file');
  await assert.rejects(client.registerEmployee(), /invitation-only/);
  await assert.rejects(client.resendEmployeeVerification(), /invitation/);
  providerConfig.onAccessInvalidated('Revoked');
  assert.deepEqual(invalidated, ['Revoked']);
  await client.signOut();
  client.clearSession();
  assert.equal(calls.length, 9);
  assert.equal(requests.length, 0);
  assert.equal(values.get(storageKey), 'unrelated-retained-login');
});
test('realtime hints and recovery invalidate authorized reads; stopped callbacks are inert', async (t) => {
  let options, connection;
  const channels = new Map();
  let closed = 0,
    connected = 0;
  window.Ably = {
    Realtime: class {
      constructor(value) {
        options = value;
        this.connection = {
          on: (fn) => {
            connection = fn;
          },
        };
        this.channels = {
          get: (name, opts) => {
            assert.deepEqual(opts, { params: { rewind: '2m' } });
            return {
              subscribe: async (fn) => {
                channels.set(name, fn);
              },
            };
          },
        };
      }
      connect() {
        connected++;
      }
      close() {
        closed++;
        throw Error('Synthetic close failure');
      }
    },
  };
  transport(t, () => json({ token: 'synthetic' }));
  const client = restored();
  const hints = [],
    states = [];
  await client.startRealtime(
    (h) => hints.push(h),
    (s) => states.push(s),
  );
  await client.startRealtime();
  assert.equal(connected, 1);
  assert.deepEqual([...channels.keys()], ['moderation:global', 'doji:global']);
  connection({ current: 'connected' });
  connection({ current: 'disconnected' });
  connection({ current: 'connected' });
  channels.get('moderation:global')({
    name: 'changed',
    data: { aggregateId: 'case', eventId: 'event' },
  });
  channels.get('doji:global')({ id: 'fallback' });
  assert.deepEqual(hints, [
    { type: 'connection.recovered' },
    { aggregateId: 'case', eventId: 'event', type: 'changed' },
    { aggregateId: undefined, eventId: 'fallback', type: 'state.updated' },
  ]);
  const token = await new Promise((resolve) =>
    options.authCallback({}, (...args) => resolve(args)),
  );
  assert.deepEqual(token, [null, { token: 'synthetic' }]);
  assert.equal(options.autoConnect, false);
  assert.equal(options.echoMessages, false);
  client.stopRealtime();
  connection({ current: 'connected' });
  channels.get('doji:global')({});
  assert.equal(hints.length, 3);
  assert.equal(states.length, 3);
  assert.equal(closed, 1);
});
test('realtime SDK failures reset loader; late loading after lock cannot start a connection', async () => {
  const scripts = [];
  globalThis.document = {
    createElement: () => ({}),
    head: { appendChild: (script) => scripts.push(script) },
  };
  const client = restored();
  const first = client.startRealtime();
  const firstFailure = assert.rejects(first, /could not be loaded/);
  assert.equal(scripts[0].src, 'https://cdn.ably.com/lib/ably.min-2.js');
  assert.equal(scripts[0].crossOrigin, 'anonymous');
  scripts[0].onerror();
  await firstFailure;
  const second = client.startRealtime();
  const secondFailure = assert.rejects(second, /did not initialize/);
  scripts[1].onload();
  await secondFailure;
  let created = 0;
  const third = client.startRealtime();
  client.clearSession();
  window.Ably = {
    Realtime: class {
      constructor() {
        created++;
      }
    },
  };
  scripts[2].onload();
  await third;
  assert.equal(scripts.length, 3);
  assert.equal(created, 0);
  assert.equal(requests.length, 0);
  delete globalThis.document;
});
for (const reason of [Error('Synthetic realtime denial'), 'opaque provider failure'])
  test(`realtime token rejection returns bounded callback error: ${String(reason)}`, async (t) => {
    let options;
    window.Ably = {
      Realtime: class {
        constructor(value) {
          options = value;
          this.connection = { on() {} };
          this.channels = { get: () => ({ subscribe: async () => {} }) };
        }
        connect() {}
        close() {}
      },
    };
    transport(t, () => Promise.reject(reason));
    const client = restored();
    await client.startRealtime();
    const result = await new Promise((resolve) =>
      options.authCallback({}, (...args) => resolve(args)),
    );
    assert.deepEqual(result, [
      reason instanceof Error ? reason.message : 'Realtime authentication failed',
      null,
    ]);
    client.stopRealtime();
  });
