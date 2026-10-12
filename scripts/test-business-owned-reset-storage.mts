// Offline composition only: real provider/store/reset/webhook adapters with an
// injected SQL transport and synthetic provider response. Actual SQL tested separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { createBusinessOwnedProvider } from '../infra/portal-identity-candidate/business-owned-provider.mts';
import { createBusinessOwnedResetStore } from '../infra/portal-identity-candidate/business-owned-reset-store.mts';
import { createBusinessOwnedReset } from '../infra/portal-identity-candidate/business-owned-reset.mts';
import { createBusinessOwnedResetEvents } from '../infra/portal-identity-candidate/business-owned-reset-events.mts';
import type { StoreExecute } from '../infra/portal-identity-candidate/business-session-store.mts';
const token = 'synthetic-reset-token-not-a-real-secret';
const tokenHash = createHash('sha256').update(token).digest('hex');
const now = Date.now(),
  signal = () => new AbortController().signal;
const policy = {
  enabled: true,
  sendingEnabled: true,
  customResetEmailEnabled: true,
  realm: 'business' as const,
  origin: 'https://business.dojipro.com',
  clientId: 'client_business',
  apiKey: 'sk_' + 'x'.repeat(24),
  encryptionKey: 'ab'.repeat(32),
  operationHmacKey: 'cd'.repeat(32),
  webhookSecret: 'synthetic-business-webhook-secret',
};
const body = {
  object: 'password_reset',
  id: 'password_reset_one',
  user_id: 'user_one',
  email: 'test@example.com',
  expires_at: new Date(now + 3600000).toISOString(),
  password_reset_token: token,
  password_reset_url: 'https://business.dojipro.com/reset?token=' + token,
};
const event = {
  event: 'password_reset.succeeded',
  id: 'event_one',
  context: { client_id: policy.clientId },
  data: { object: 'password_reset', id: body.id, user_id: body.user_id },
};
function request(
  payload: unknown = event,
  overrides: {
    timestamp?: number;
    secret?: string;
    raw?: string;
    header?: string;
    path?: string;
  } = {},
) {
  const raw = overrides.raw ?? JSON.stringify(payload),
    timestamp = overrides.timestamp ?? now;
  const signature = createHmac('sha256', overrides.secret ?? policy.webhookSecret)
    .update(`${timestamp}.${raw}`)
    .digest('hex');
  return new Request(policy.origin + (overrides.path ?? '/auth/owned/reset-events'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'workos-signature': overrides.header ?? `t=${timestamp},v1=${signature}`,
    },
    body: raw,
  });
}
function fixture() {
  let envelope: string | null = null,
    state: 'new' | 'pending' | 'complete' = 'new',
    operation: string | null = null,
    providerCalls = 0,
    writes = 0,
    dbFailure = false;
  const calls: { sql: string; params: (string | number | null)[] }[] = [];
  const execute: StoreExecute = async (role, sql, params) => {
    assert.equal(role, 'doji_business_session');
    calls.push({ sql, params });
    if (dbFailure) throw Error('private SQL data');
    if (sql.includes('put_owned_reset_link_v1')) {
      envelope = String(params[3]);
      writes++;
      return { state: 'ok' };
    }
    if (sql.includes('get_owned_reset_link_v1'))
      return envelope ? { state: 'ok', envelope } : { state: 'missing' };
    if (sql.includes('begin_owned_reset_link_v1')) {
      assert.equal(params[1], tokenHash);
      assert.equal(params[5], body.user_id);
      if (state !== 'new') {
        assert.equal(params[2], operation);
        return { state };
      }
      operation = String(params[2]);
      state = 'pending';
      return { state: 'started' };
    }
    if (sql.includes('reconcile_owned_reset_link_v1')) {
      assert.equal(params[2], body.id);
      assert.equal(params[5], body.user_id);
      if (state !== 'complete') writes++;
      state = 'complete';
      return { state };
    }
    if (sql.includes('complete_owned_reset_link_v1')) {
      writes++;
      state = 'complete';
      return { state };
    }
    throw Error('Unexpected SQL');
  };
  const store = () => createBusinessOwnedResetStore(policy, execute, () => now);
  const handler = (overrides = {}) =>
    createBusinessOwnedResetEvents({ ...policy, ...overrides }, store(), () => now);
  const reset = () => {
    const currentStore = store();
    return createBusinessOwnedReset(policy, {
      resolve: currentStore.resolve,
      guard: { ...currentStore, admit: async () => 'f'.repeat(64) },
      verifyProof: async () => true,
      trustedClientIp: '192.0.2.1',
      now: () => now,
      provider: {
        reset: async () => {
          providerCalls++;
          throw Error('network outcome unknown');
        },
      },
    });
  };
  const remember = () =>
    store().remember(
      { resetId: body.id, subject: body.user_id, tokenHash, expires: now + 3600000 },
      'e'.repeat(64),
      signal(),
    );
  return {
    store,
    handler,
    reset,
    remember,
    calls,
    state: () => state,
    writes: () => writes,
    envelope: () => envelope,
    setEnvelope: (value: string) => {
      envelope = value;
    },
    fail: (value: boolean) => {
      dbFailure = value;
    },
    providerCalls: () => providerCalls,
  };
}
test('provider recovery projects validated hashed metadata without token, URL or email', async () => {
  const provider = createBusinessOwnedProvider(policy, async () => Response.json(body));
  const result = await provider.recover(body.email, signal(), async (_metadata, raw) => {
    assert.equal(raw, token);
  });
  assert.deepEqual(result, {
    resetId: body.id,
    subject: body.user_id,
    tokenHash,
    expires: now + 3600000,
  });
  for (const secret of [token, body.email, body.password_reset_url])
    assert.ok(!JSON.stringify(result).includes(secret));
  for (const invalid of [
    { ...body, user_id: 'employee_uuid' },
    { ...body, email: 'other@example.com' },
    { ...body, expires_at: 'bad-date' },
    { ...body, password_reset_token: 'short' },
    { ...body, expires_at: new Date(now - 1).toISOString() },
  ]) {
    const bad = createBusinessOwnedProvider(policy, async () => Response.json(invalid));
    await assert.rejects(
      bad.recover(body.email, signal(), async () => {
        assert.fail('invalid response cannot send');
      }),
      (e) => e instanceof Error && !e.message.includes(token),
    );
  }
});
test('mapping survives adapter recreation, encrypted and bound to token, origin and client', async () => {
  const f = fixture();
  await f.remember();
  assert.ok(f.envelope());
  assert.ok(!f.envelope()!.includes(body.user_id));
  assert.ok(!JSON.stringify(f.calls).includes(token));
  const mapped = await f.store().resolve(tokenHash, signal());
  assert.equal(mapped?.subject, body.user_id);
  assert.equal(mapped?.resetId, body.id);
  await assert.rejects(f.store().resolve('a'.repeat(64), signal()));
  f.setEnvelope(f.envelope()!.slice(0, -8) + 'AAAAAAAA');
  await assert.rejects(f.store().resolve(tokenHash, signal()));
});
test('signed matching success recovers a timed-out reset across coordinator restart, without redispatch', async () => {
  const f = fixture();
  await f.remember();
  assert.deepEqual(await f.reset()(token, 'new-password', 'proof', signal()), {
    step: 'reset-pending',
  });
  assert.equal(f.state(), 'pending');
  assert.equal(f.providerCalls(), 1);
  assert.equal((await f.handler()(request())).status, 200);
  assert.equal(f.state(), 'complete');
  const writes = f.writes();
  assert.equal((await f.handler()(request())).status, 200);
  assert.equal(f.writes(), writes);
  assert.deepEqual(await f.reset()(token, 'new-password', 'proof', signal()), {
    step: 'reset-done',
  });
  assert.equal(f.providerCalls(), 1);
});
test('bad signature, old/future timestamp, cross-client, duplicates and oversized webhook fail before SQL', async () => {
  const f = fixture();
  const bad = [
    request(event, { secret: 'wrong-employee-secret' }),
    request(event, { timestamp: now - 180001 }),
    request(event, { timestamp: now + 180001 }),
    request(event, { header: 't=123,v1=x' }),
    request(event, { header: `t=${now},t=${now},v1=${'a'.repeat(64)}` }),
    request({ ...event, context: { client_id: 'client_employee' } }),
    request({ ...event, data: { ...event.data, user_id: 'member-uuid' } }),
    request(event, { raw: JSON.stringify({ ...event, extra: 'a'.repeat(20000) }) }),
  ];
  for (const r of bad) assert.equal((await f.handler()(r)).status, 401);
  assert.equal(f.calls.length, 0);
});
test('disabled, wrong route and non-success events never reconcile', async () => {
  const f = fixture();
  assert.equal((await f.handler({ enabled: false })(request())).status, 503);
  assert.equal(
    (await f.handler()(request(event, { path: '/auth/owned/reset-events?override=1' }))).status,
    404,
  );
  assert.equal(
    (await f.handler()(request({ ...event, event: 'password_reset.created' }))).status,
    200,
  );
  assert.equal(f.calls.length, 0);
});
test('database failure is retryable for signed evidence, without raw errors or a false acknowledgement', async () => {
  const f = fixture();
  await f.remember();
  await f.reset()(token, 'new-password', 'proof', signal());
  f.fail(true);
  const response = await f.handler()(request());
  assert.equal(response.status, 503);
  assert.equal(await response.text(), '');
  assert.equal(f.state(), 'pending');
  f.fail(false);
  assert.equal((await f.handler()(request())).status, 200);
  assert.equal(f.state(), 'complete');
  assert.equal(f.providerCalls(), 1);
});
test('missing or failed durable mapping never reaches provider mutation', async () => {
  const f = fixture();
  await assert.rejects(f.reset()(token, 'new-password', 'proof', signal()));
  assert.equal(f.providerCalls(), 0);
  f.fail(true);
  await assert.rejects(
    f.remember(),
    (e) => e instanceof Error && e.message === 'Business reset storage unavailable.',
  );
  assert.equal(f.envelope(), null);
});
