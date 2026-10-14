import test from 'node:test';
import assert from 'node:assert/strict';
import { createBusinessOwnedGuard } from '../infra/portal-identity/business-owned-guard.mts';
const policy = {
  enabled: true,
  realm: 'business' as const,
  origin: 'https://business.dojipro.com',
  clientId: 'client_business',
  admissionHmacKey: 'ab'.repeat(32),
};
const signal = () => new AbortController().signal;
test('guard rejects disabled and cross-realm construction', () => {
  for (const patch of [
    { enabled: false },
    { origin: 'https://admin.dojipro.com' },
    { admissionHmacKey: 'short' },
  ])
    assert.throws(() =>
      createBusinessOwnedGuard({ ...policy, ...patch }, async () => assert.fail('No DB call')),
    );
});
test('admission sends only scoped HMAC keys and server-generated one-use attempt ID', async () => {
  const calls: unknown[] = [];
  const guard = createBusinessOwnedGuard(policy, async (role, sql, params) => {
    assert.equal(role, 'doji_business_session');
    assert.equal(
      sql,
      'select business_session_private.admit_owned_auth_v1($1,$2,$3,$4,$5) as result',
    );
    calls.push(params);
    return { state: 'allowed', ticket: params[2] };
  });
  const identity = guard.identityKey('Sample@example.com');
  assert.equal(identity, guard.identityKey('sample@example.com'));
  const a = await guard.admit('signin', identity, '192.0.2.1', signal());
  const b = await guard.admit('verify', identity, '192.0.2.1', signal());
  assert.notEqual(a, b);
  assert.ok(!/sample|example|192\.0\.2/.test(JSON.stringify(calls)));
  await assert.rejects(guard.admit('signin', identity, 'spoofed-ip', signal()));
  assert.equal(calls.length, 2);
});
test('admission never retries or exposes raw database errors', async () => {
  let calls = 0;
  const guard = createBusinessOwnedGuard(policy, async () => {
    calls++;
    throw Error('private SQL credential');
  });
  await assert.rejects(
    guard.admit('signin', guard.identityKey('sample@example.com'), '192.0.2.1', signal()),
    (e) => e instanceof Error && !e.message.includes('private'),
  );
  assert.equal(calls, 1);
});
test('reset state distinguishes first dispatch from ambiguous pending and completion', async () => {
  for (const state of ['started', 'pending', 'complete'] as const) {
    const guard = createBusinessOwnedGuard(policy, async (role, sql, params) => {
      assert.equal(role, 'doji_business_session');
      assert.ok(sql.includes('begin_owned_reset_v1'));
      assert.equal(params[2], 'https://api.workos.com/user_management/client_business');
      assert.equal(params[3], policy.clientId);
      return { state };
    });
    assert.equal(await guard.beginReset('a'.repeat(64), 'user_one', signal()), state);
  }
});
test('installation pins realm, issuer, audience, live verified actor and original ticket', async () => {
  let calls = 0;
  const guard = createBusinessOwnedGuard(
    policy,
    async (role, sql, params) => {
      calls++;
      assert.equal(role, 'doji_business_session');
      assert.ok(sql.includes('put_owned_session_v1'));
      assert.equal(params[1], 'b'.repeat(64));
      return { state: 'ok' };
    },
    () => 1000000,
  );
  const actor = {
    realm: 'business' as const,
    subject: 'user_one',
    sessionId: 'session_one',
    issuer: 'https://api.workos.com/user_management/client_business',
    audience: policy.clientId,
    mfaVerified: false,
    expiresAtSeconds: 2000,
  };
  await guard.install('b'.repeat(64), 'c'.repeat(64), 'x'.repeat(64), 1100000, actor, signal());
  for (const patch of [
    { audience: 'client_employee' },
    { issuer: 'https://employee.test' },
    { expiresAtSeconds: 1 },
  ])
    await assert.rejects(
      guard.install(
        'b'.repeat(64),
        'c'.repeat(64),
        'x'.repeat(64),
        1100000,
        { ...actor, ...patch },
        signal(),
      ),
    );
  assert.equal(calls, 1);
});
