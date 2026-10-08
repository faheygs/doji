import test from 'node:test';
import assert from 'node:assert/strict';
import { createBusinessMfa } from '../infra/portal-identity-candidate/business-mfa.mts';
import { businessMfaCommand } from '../infra/portal-identity-candidate/business-mfa-session.mts';
import type {
  SavedSession,
  VerifiedBusinessActor,
} from '../infra/portal-identity-candidate/business-http-state.mts';
const at = Date.now(),
  config = { clientId: 'client_business', apiKey: 'sk_' + 'a'.repeat(32) };
const actor: VerifiedBusinessActor = {
  realm: 'business',
  issuer: 'https://api.workos.com/user_management/client_business',
  audience: config.clientId,
  subject: 'user_business',
  sessionId: 'session_business',
  mfaVerified: false,
  expiresAtSeconds: Math.floor(at / 1000) + 3600,
};
const factor = { id: 'auth_factor_one', type: 'totp' };
const challenge = {
  id: 'auth_challenge_one',
  authentication_factor_id: factor.id,
  expires_at: new Date(at + 240000).toISOString(),
};
const signal = () => AbortSignal.timeout(3000);
function fixture(
  options: { list?: unknown; result?: unknown; challenge?: unknown; status?: number } = {},
) {
  const calls: string[] = [];
  const mfa = createBusinessMfa(
    config,
    async (url, init) => {
      calls.push(String(url));
      assert.equal(init?.redirect, 'error');
      assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${config.apiKey}`);
      if (options.status) return new Response(null, { status: options.status });
      if (String(url).endsWith('/auth_factors')) {
        if (init?.method === 'POST')
          return Response.json({
            authentication_factor: { ...factor, totp: { secret: 'ABCDEFGHIJKLMNOP' } },
            authentication_challenge: options.challenge ?? challenge,
          });
        return Response.json(options.list ?? { data: [factor] });
      }
      if (String(url).endsWith('/verify'))
        return Response.json(options.result ?? { valid: true, challenge });
      return Response.json(options.challenge ?? challenge);
    },
    () => at,
  );
  return { mfa, calls };
}
test('only business configuration and current verified identity are accepted', async () => {
  assert.throws(() => createBusinessMfa({ ...config, apiKey: 'bad' }));
  const f = fixture();
  for (const delta of [
    { realm: 'employee' },
    { audience: 'client_employee' },
    { expiresAtSeconds: 0 },
  ])
    await assert.rejects(
      f.mfa.prepare({ ...actor, ...delta } as VerifiedBusinessActor, false, signal()),
    );
  assert.equal(f.calls.length, 0);
});
test('existing TOTP challenge creates no MFA assurance until successful verification', async () => {
  const { mfa } = fixture();
  const result = await mfa.prepare(actor, false, signal());
  assert.ok('pending' in result);
  assert.equal(mfa.attest(actor, result.pending).mfaVerified, false);
  const receipt = await mfa.complete(actor, result.pending, '123456', signal());
  assert.equal(mfa.attest(actor, receipt).mfaVerified, true);
  assert.equal(receipt.expires, at + 8 * 3600000);
  assert.equal('enrollmentSecret' in result, false);
});
test('enrollment requires explicit intent and cannot replace an existing factor', async () => {
  const f = fixture({ list: { data: [] } });
  assert.deepEqual(await f.mfa.prepare(actor, false, signal()), { enrollmentRequired: true });
  const result = await f.mfa.prepare(actor, true, signal());
  assert.equal('enrollmentSecret' in result && result.enrollmentSecret, 'ABCDEFGHIJKLMNOP');
  assert.ok('pending' in result && !JSON.stringify(result.pending).includes('ABCDEFGHIJKLMNOP'));
  await assert.rejects(fixture().mfa.prepare(actor, true, signal()));
});
for (const list of [
  {},
  { data: [factor, factor] },
  { data: [{ ...factor, type: 'sms' }] },
  { data: [{ id: '../user_other', type: 'totp' }] },
  { data: Array(11).fill(factor) },
])
  test(
    'invalid or unbounded factor list fails closed ' + JSON.stringify(list).slice(0, 80),
    async () => {
      await assert.rejects(fixture({ list }).mfa.prepare(actor, false, signal()));
    },
  );
for (const result of [
  { valid: false, challenge },
  { valid: 'true', challenge },
  { valid: true, challenge: { ...challenge, id: 'auth_challenge_other' } },
  { valid: true, challenge: { ...challenge, authentication_factor_id: 'auth_factor_other' } },
  { valid: true, challenge: { ...challenge, expires_at: new Date(at - 1).toISOString() } },
])
  test(
    'mismatched or unsuccessful verification never grants MFA ' + JSON.stringify(result),
    async () => {
      const { mfa } = fixture({ result });
      const prepared = await mfa.prepare(actor, false, signal());
      assert.ok('pending' in prepared);
      await assert.rejects(mfa.complete(actor, prepared.pending, '123456', signal()));
    },
  );
test('wrong session, subject, factor, code and expired challenge denied before verification', async () => {
  const f = fixture(),
    prepared = await f.mfa.prepare(actor, false, signal());
  assert.ok('pending' in prepared);
  for (const delta of [
    { sessionId: 'session_other' },
    { subject: 'user_other' },
    { factorId: 'auth_factor_other' },
    { expires: at - 1 },
    { expires: at + 400000 },
  ])
    await assert.rejects(
      f.mfa.complete(actor, { ...prepared.pending, ...delta }, '123456', signal()),
    );
  await assert.rejects(f.mfa.complete(actor, prepared.pending, '12345', signal()));
  assert.equal(
    f.calls.some((c) => c.endsWith('/verify')),
    false,
  );
});
test('receipt cannot cross session/directory or extend expiry, and never uses account metadata', async () => {
  const { mfa } = fixture(),
    prepared = await mfa.prepare(actor, false, signal());
  assert.ok('pending' in prepared);
  const receipt = await mfa.complete(actor, prepared.pending, '123456', signal());
  for (const delta of [
    { sessionId: 'session_other' },
    { subject: 'user_other' },
    { clientId: 'client_other' },
    { method: 'metadata' },
    { verifiedAt: at + 1 },
    { expires: at },
    { expires: at + 9 * 3600000 },
  ])
    assert.equal(mfa.attest(actor, { ...receipt, ...delta }).mfaVerified, false);
  assert.equal(mfa.attest({ ...actor, mfaVerified: true }, undefined).mfaVerified, false);
});
test('provider errors and aborted calls fail closed without automatic retries', async () => {
  const f = fixture({ status: 429 });
  await assert.rejects(f.mfa.prepare(actor, false, signal()));
  assert.equal(f.calls.length, 1);
  const aborted = fixture();
  await assert.rejects(aborted.mfa.prepare(actor, false, AbortSignal.abort()));
  assert.equal(aborted.calls.length, 0);
});
function saved(): SavedSession {
  return {
    actor,
    tokens: { subject: actor.subject, accessToken: 'a', refreshToken: 'r' },
    csrf: 'c',
    created: at,
    touched: at,
  };
}
test('durable challenge consumption precedes provider verification and replay cannot succeed', async () => {
  const { mfa } = fixture(),
    state = saved(),
    writes: string[] = [];
  const persist = async () => {
    writes.push(JSON.stringify(state));
  };
  await businessMfaCommand(
    '/auth/mfa/prepare',
    { enroll: false },
    state,
    persist,
    mfa,
    signal(),
    () => at,
  );
  assert.ok(state.mfaPending);
  await businessMfaCommand(
    '/auth/mfa/complete',
    { code: '123456' },
    state,
    persist,
    mfa,
    signal(),
    () => at,
  );
  assert.ok(state.mfaReceipt);
  assert.equal(JSON.parse(writes[2]!).mfaPending, undefined);
  assert.equal(state.actor.mfaVerified, true);
  await assert.rejects(
    businessMfaCommand(
      '/auth/mfa/complete',
      { code: '123456' },
      state,
      persist,
      mfa,
      signal(),
      () => at,
    ),
  );
});
test('MFA preparation cooldown and session cap are persisted before provider side effects', async () => {
  const f = fixture(),
    state = saved();
  await businessMfaCommand(
    '/auth/mfa/prepare',
    { enroll: false },
    state,
    async () => {},
    f.mfa,
    signal(),
    () => at,
  );
  const count = f.calls.length;
  await assert.rejects(
    businessMfaCommand(
      '/auth/mfa/prepare',
      { enroll: false },
      state,
      async () => {},
      f.mfa,
      signal(),
      () => at,
    ),
  );
  state.mfaNextAt = 0;
  state.mfaAttempts = 5;
  await assert.rejects(
    businessMfaCommand(
      '/auth/mfa/prepare',
      { enroll: false },
      state,
      async () => {},
      f.mfa,
      signal(),
      () => at,
    ),
  );
  assert.equal(f.calls.length, count);
  await assert.rejects(
    businessMfaCommand(
      '/auth/mfa/prepare',
      { enroll: false },
      saved(),
      async () => {
        throw Error('storage failed');
      },
      f.mfa,
      signal(),
      () => at,
    ),
  );
  assert.equal(f.calls.length, count);
});

test('rejected code consumes its challenge but preserves identity for a deliberate new attempt', async () => {
  const f = fixture({ result: { valid: false, challenge } }),
    state = saved();
  await businessMfaCommand(
    '/auth/mfa/prepare',
    { enroll: false },
    state,
    async () => {},
    f.mfa,
    signal(),
    () => at,
  );
  await assert.rejects(
    businessMfaCommand(
      '/auth/mfa/complete',
      { code: '000000' },
      state,
      async () => {},
      f.mfa,
      signal(),
      () => at,
    ),
    (error: unknown) =>
      typeof error === 'object' && error !== null && 'status' in error && error.status === 400,
  );
  assert.equal(state.mfaPending, undefined);
  assert.equal(state.mfaReceipt, undefined);
  assert.equal(state.actor.subject, actor.subject);
  assert.equal(state.actor.mfaVerified, false);
  assert.equal(f.calls.filter((url) => url.endsWith('/verify')).length, 1);
});

test('new enrollment is absent from provider list until verified; post-verification ownership is mandatory', async () => {
  for (const attached of [true, false]) {
    let verified = false;
    const mfa = createBusinessMfa(
      config,
      async (url, init) => {
        if (String(url).endsWith('/auth_factors')) {
          if (init?.method === 'POST')
            return Response.json({
              authentication_factor: { ...factor, totp: { secret: 'ABCDEFGHIJKLMNOP' } },
              authentication_challenge: challenge,
            });
          return Response.json({ data: verified && attached ? [factor] : [] });
        }
        assert.ok(String(url).endsWith('/verify'));
        verified = true;
        return Response.json({ valid: true, challenge });
      },
      () => at,
    );
    const prepared = await mfa.prepare(actor, true, signal());
    assert.ok('pending' in prepared && prepared.pending.enrollment);
    const complete = mfa.complete(actor, prepared.pending, '123456', signal());
    if (attached) assert.equal(mfa.attest(actor, await complete).mfaVerified, true);
    else await assert.rejects(complete);
  }
});
