// Offline cryptographic/transport tests; no users, email or hosted mutations.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createWorkosEmployeeProvider } from '../infra/portal-identity-candidate/workos-employee-provider.mts';
import type { EmployeeProviderConfig } from '../infra/portal-identity-candidate/workos-employee-provider.mts';
import type { PortalFetch } from '../infra/portal-identity-candidate/portal-contracts.mts';
import type { JWTPayload } from 'jose';
import { present, testRecord } from './employee-test-fixtures.mts';
const keys = await generateKeyPair('ES256');
const config: EmployeeProviderConfig = {
  enabled: true,
  realm: 'employee',
  clientId: 'client_employee',
  apiKey: 'sk_' + 'a'.repeat(24),
  origin: 'https://employee.test',
  encryptionKey: 'ab'.repeat(32),
  maxMfaAgeSeconds: 3600,
  maxTokenAgeSeconds: 900,
  jwks: {
    keys: [{ ...(await exportJWK(keys.publicKey)), kid: 'employee', alg: 'ES256', use: 'sig' }],
  },
};
const signal = () => new AbortController().signal;
const issuer = 'https://api.workos.com/user_management/client_employee';
interface FixtureOptions {
  claims?: JWTPayload;
  refreshClaims?: JWTPayload;
  user?: Record<string, unknown>;
  challenge?: Record<string, unknown>;
  grant?: Record<string, unknown>;
  pending?: Record<string, unknown>;
  passwordSuccess?: boolean;
  enroll?: boolean;
  listedSid?: string;
  inactive?: boolean;
}
async function fixture(options: FixtureOptions = {}) {
  const calls: { url: string; body: Record<string, unknown> | undefined }[] = [];
  let consumed = false,
    revoked = false,
    refreshes = 0;
  const claims = () => ({
    iss: issuer,
    aud: config.clientId,
    sub: 'user_employee',
    sid: 'session_employee',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 600,
    ...options.claims,
    ...(refreshes ? options.refreshClaims : {}),
  });
  const signed = () =>
    new SignJWT(claims())
      .setProtectedHeader({ alg: 'ES256', kid: 'employee' })
      .sign(keys.privateKey);
  const user = { id: 'user_employee', email_verified: true, ...options.user };
  const factor = { id: 'auth_factor_employee', type: 'totp', totp: { secret: 'ABCDEFGHIJKLMNOP' } };
  const challenge = () => ({
    id: 'auth_challenge_employee',
    authentication_factor_id: factor.id,
    expires_at: new Date(Date.now() + 240000).toISOString(),
    ...options.challenge,
  });
  const grant = async () => ({
    user,
    access_token: await signed(),
    refresh_token: 'refresh-secret',
    ...options.grant,
  });
  const fetcher: PortalFetch = async (url, rawInit) => {
    const init = present(rawInit);
    assert.equal(init.redirect, 'error');
    assert.ok(url.startsWith('https://api.workos.com/'));
    assert.ok(init.body === undefined || typeof init.body === 'string');
    const body = init.body ? testRecord(JSON.parse(init.body)) : undefined;
    calls.push({ url, body });
    const response = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status });
    if (url.endsWith('/authenticate')) {
      assert.ok(body);
      assert.equal(body.client_id, config.clientId);
      assert.equal(body.client_secret, config.apiKey);
      if (body.grant_type === 'password') {
        if (options.passwordSuccess) return response(await grant());
        return response(
          {
            code: options.enroll ? 'mfa_enrollment' : 'mfa_challenge',
            user,
            pending_authentication_token: 'pending-secret',
            authentication_factors: [factor],
            ...options.pending,
          },
          400,
        );
      }
      if (body.grant_type === 'refresh_token') {
        refreshes++;
        return response(await grant());
      }
      assert.equal(body.grant_type, 'urn:workos:oauth:grant-type:mfa-totp');
      assert.equal(body.pending_authentication_token, 'pending-secret');
      assert.equal(body.authentication_challenge_id, 'auth_challenge_employee');
      if (consumed || body.code !== '123456')
        return response({ message: 'secret-provider-error' }, 400);
      consumed = true;
      return response(await grant());
    }
    if (url.endsWith('/auth_factors'))
      return response(
        { authentication_factor: factor, authentication_challenge: challenge() },
        201,
      );
    if (url.endsWith('/challenge')) return response(challenge(), 201);
    if (url.endsWith('/sessions/revoke')) {
      assert.deepEqual(body, { session_id: 'session_employee' });
      revoked = true;
      return new Response(null, { status: 204 });
    }
    if (url.includes('/sessions?limit=10'))
      return response({
        data: [
          {
            id: options.listedSid || 'session_employee',
            user_id: 'user_employee',
            status: revoked || options.inactive ? 'revoked' : 'active',
            expires_at: new Date(Date.now() + 7200000).toISOString(),
          },
        ],
      });
    if (url.endsWith('/user_employee')) return response(user);
    assert.fail('Unexpected provider URL');
  };
  const provider = createWorkosEmployeeProvider(config, fetcher);
  async function prepared() {
    const started = await provider.begin('owner@example.test', 'test-password', signal());
    return provider.prepare(started.pending, signal());
  }
  return {
    provider,
    calls,
    prepared,
    fetcher,
    get refreshes() {
      return refreshes;
    },
  };
}
test('TOTP completion creates sealed proof for verified exact employee session', async () => {
  const f = await fixture();
  const p = await f.prepared();
  assert.equal('enrollmentSecret' in p, false);
  assert.equal(p.pending.includes('pending-secret'), false);
  const result = await f.provider.complete(p.pending, '123456', signal());
  assert.equal(result.identity.mfaVerified, true);
  assert.equal(result.identity.sessionId, 'session_employee');
  assert.equal(result.mfaReceipt.includes('user_employee'), false);
  assert.equal(f.calls.length, 5); // password, challenge, grant, bounded user + sessions
  assert.equal(JSON.stringify(result).includes('test-password'), false);
  assert.equal(
    (await f.provider.verify(result.accessToken, result.mfaReceipt, result.subject, signal()))
      .mfaVerified,
    true,
  );
});
test('enrollment produces a setup secret but not an authenticated session', async () => {
  const f = await fixture({ enroll: true });
  const p = await f.prepared();
  assert.equal(p.enrollmentSecret, 'ABCDEFGHIJKLMNOP');
  assert.equal('mfaReceipt' in p, false);
  assert.equal('accessToken' in p, false);
  const request = f.calls.find((c) => c.url.endsWith('/auth_factors'));
  assert.equal(present(present(request).body).type, 'totp');
  assert.equal('totp_secret' in present(present(request).body), false);
});
for (const [name, options] of [
  ['password-only success', { passwordSuccess: true }],
  ['unverified email', { user: { email_verified: false } }],
  ['empty pending token', { pending: { pending_authentication_token: '' } }],
  ['SMS factor', { pending: { authentication_factors: [{ id: 'auth_factor_sms', type: 'sms' }] } }],
  ['no factors', { pending: { authentication_factors: [] } }],
  [
    'oversized factor list',
    {
      pending: {
        authentication_factors: Array.from({ length: 11 }, () => ({
          id: 'auth_factor_x',
          type: 'totp',
        })),
      },
    },
  ],
  ['non-MFA auth result', { pending: { code: 'organization_selection_required' } }],
] as const)
  test('begin rejects ' + name, async () => {
    const f = await fixture(options);
    await assert.rejects(
      f.provider.begin('owner@example.test', 'secret', signal()),
      /Employee authentication could not be verified/,
    );
    assert.equal(f.calls.length, 1);
  });
for (const [name, options] of [
  ['wrong factor', { authentication_factor_id: 'auth_factor_other' }],
  ['expired challenge', { expires_at: '2000-01-01T00:00:00Z' }],
  ['missing expiry', { expires_at: null }],
] as const)
  test('prepare rejects ' + name, async () => {
    const f = await fixture({ challenge: options });
    await assert.rejects(f.prepared(), /Employee authentication could not be verified/);
  });
for (const [name, options] of [
  ['business audience', { claims: { aud: 'client_business' } }],
  [
    'business issuer',
    { claims: { iss: 'https://api.workos.com/user_management/client_business' } },
  ],
  ['different signed user', { claims: { sub: 'user_other' } }],
  ['expired JWT', { claims: { exp: 1 } }],
  ['impersonation', { grant: { impersonator: { email: 'support@example.test' } } }],
  ['empty access token', { grant: { access_token: '' } }],
  ['inactive session', { inactive: true }],
] as const)
  test('TOTP completion rejects ' + name, async () => {
    const f = await fixture(options),
      p = await f.prepared();
    await assert.rejects(
      f.provider.complete(p.pending, '123456', signal()),
      /Employee authentication could not be verified/,
    );
  });
test('wrong code and consumed pending login never create a second session', async () => {
  const f = await fixture(),
    p = await f.prepared();
  await assert.rejects(
    f.provider.complete(p.pending, '000000', signal()),
    /Employee authentication could not be verified/,
  );
  await f.provider.complete(p.pending, '123456', signal());
  await assert.rejects(
    f.provider.complete(p.pending, '123456', signal()),
    /Employee authentication could not be verified/,
  );
});
test('pending records reject tampering, wrong phase, environment and purpose', async () => {
  const f = await fixture(),
    start = await f.provider.begin('owner@example.test', 'secret', signal());
  const count = f.calls.length;
  await assert.rejects(f.provider.complete(start.pending, '123456', signal()));
  await assert.rejects(f.provider.prepare('a' + start.pending.slice(1), signal()));
  const other = createWorkosEmployeeProvider({ ...config, clientId: 'client_other' }, f.fetcher);
  await assert.rejects(other.prepare(start.pending, signal()));
  assert.equal(f.calls.length, count);
  const p = await f.provider.prepare(start.pending, signal());
  const result = await f.provider.complete(p.pending, '123456', signal());
  await assert.rejects(f.provider.prepare(result.mfaReceipt, signal()));
});
test('refresh preserves exact session and the original MFA receipt', async () => {
  const f = await fixture(),
    p = await f.prepared();
  const result = await f.provider.complete(p.pending, '123456', signal());
  const refreshed = await f.provider.refresh(
    { ...result, sessionId: result.identity.sessionId },
    signal(),
  );
  assert.equal(refreshed.mfaReceipt, result.mfaReceipt);
  assert.equal(refreshed.identity.sessionId, result.identity.sessionId);
  assert.equal(f.refreshes, 1);
  await f.provider.revoke(refreshed.identity.sessionId, signal());
  await assert.rejects(
    f.provider.verify(refreshed.accessToken, refreshed.mfaReceipt, refreshed.subject, signal()),
  );
});
test('refresh cannot use a receipt from another subject/session', async () => {
  const f = await fixture(),
    p = await f.prepared();
  const result = await f.provider.complete(p.pending, '123456', signal());
  for (const change of [
    { subject: 'user_other' },
    { sessionId: 'session_other' },
    { mfaReceipt: p.pending },
  ]) {
    await assert.rejects(
      f.provider.refresh({ ...result, sessionId: result.identity.sessionId, ...change }, signal()),
    );
  }
  assert.equal(f.refreshes, 0);
});
test('refresh cannot mint proof for a changed provider sid', async () => {
  const f = await fixture({
    refreshClaims: { sid: 'session_other' },
    listedSid: 'session_employee',
  });
  const p = await f.prepared(),
    result = await f.provider.complete(p.pending, '123456', signal());
  await assert.rejects(
    f.provider.refresh({ ...result, sessionId: result.identity.sessionId }, signal()),
  );
});
test('disabled provider and aborted request make no network calls', async () => {
  const f = await fixture();
  const disabled = createWorkosEmployeeProvider({ ...config, enabled: false }, f.fetcher);
  await assert.rejects(disabled.begin('owner@example.test', 'secret', signal()));
  await assert.rejects(f.provider.begin('owner@example.test', 'secret', AbortSignal.abort()));
  assert.equal(f.calls.length, 0);
});
test('uncooperative transport is bounded and its secrets never enter errors', async () => {
  const provider = createWorkosEmployeeProvider(config, () => new Promise(() => {}));
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort('sensitive abort reason'), 30);
  try {
    await assert.rejects(provider.begin('owner@example.test', 'secret', abort.signal), {
      message: 'Employee authentication could not be verified',
    });
  } finally {
    clearTimeout(timer);
  }
});
test('stalled response body and cancellation are bounded', async () => {
  const provider = createWorkosEmployeeProvider(
    config,
    async () =>
      new Response(
        new ReadableStream({
          pull() {
            return new Promise(() => {});
          },
          cancel() {
            return new Promise(() => {});
          },
        }),
      ),
  );
  const abort = new AbortController(),
    timer = setTimeout(() => abort.abort(), 30);
  try {
    await assert.rejects(provider.begin('owner@example.test', 'secret', abort.signal));
  } finally {
    clearTimeout(timer);
  }
});
test('invalid policy cannot construct an employee provider', () => {
  for (const change of [
    { realm: 'business' },
    { origin: 'http://employee.test' },
    { encryptionKey: 'bad' },
    { maxMfaAgeSeconds: 28801 },
    { maxMfaAgeSeconds: 0 },
    { jwks: { keys: [] } },
  ]) {
    assert.throws(() =>
      Reflect.apply(createWorkosEmployeeProvider, undefined, [{ ...config, ...change }]),
    );
  }
});
test('sealed MFA evidence survives server restart, but not key or origin changes', async () => {
  const f = await fixture(),
    p = await f.prepared();
  const result = await f.provider.complete(p.pending, '123456', signal());
  const restarted = createWorkosEmployeeProvider(config, f.fetcher);
  assert.equal(
    (await restarted.verify(result.accessToken, result.mfaReceipt, result.subject, signal()))
      .mfaVerified,
    true,
  );
  for (const changed of [{ encryptionKey: 'cd'.repeat(32) }, { origin: 'https://other.test' }]) {
    const other = createWorkosEmployeeProvider({ ...config, ...changed }, f.fetcher);
    await assert.rejects(
      other.verify(result.accessToken, result.mfaReceipt, result.subject, signal()),
    );
  }
});
test('expired pending state cannot start enrollment or make a provider call', async () => {
  const f = await fixture({ enroll: true });
  const started = await f.provider.begin('owner@example.test', 'secret', signal());
  const original = Date.now;
  try {
    Date.now = () => original() + 300001;
    await assert.rejects(f.provider.prepare(started.pending, signal()));
    assert.equal(f.calls.length, 1);
  } finally {
    Date.now = original;
  }
});
test('expired MFA receipt blocks refresh before token rotation', async () => {
  const f = await fixture(),
    p = await f.prepared();
  const result = await f.provider.complete(p.pending, '123456', signal());
  const original = Date.now;
  try {
    Date.now = () => original() + 3601000;
    await assert.rejects(
      f.provider.refresh({ ...result, sessionId: result.identity.sessionId }, signal()),
    );
    assert.equal(f.refreshes, 0);
  } finally {
    Date.now = original;
  }
});
test('oversized and non-JSON upstream errors are sanitized', async () => {
  for (const body of ['secret-detail'.repeat(7000), 'private invalid json']) {
    const provider = createWorkosEmployeeProvider(
      config,
      async () => new Response(body, { status: 500 }),
    );
    await assert.rejects(provider.begin('owner@example.test', 'secret', signal()), {
      message: 'Employee authentication could not be verified',
    });
  }
});
