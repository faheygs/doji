// Called ONLY by the no-network clean-room PostgreSQL runner. No provider fetch.
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { createBusinessOwnedGuard } from '../infra/portal-identity/business-owned-guard.mts';
import { createBusinessOwnedResetStore } from '../infra/portal-identity/business-owned-reset-store.mts';
import { createBusinessOwnedReset } from '../infra/portal-identity/business-owned-reset.mts';
import { createBusinessOwnedResetEvents } from '../infra/portal-identity/business-owned-reset-events.mts';
import type { StoreExecute } from '../infra/portal-identity/business-session-store.mts';
export async function resetRoundTrip(sql: (source: string) => string) {
  const policy = {
    enabled: true,
    sendingEnabled: true,
    realm: 'business' as const,
    origin: 'https://business.dojipro.com',
    clientId: 'client_business',
    encryptionKey: 'ab'.repeat(32),
    admissionHmacKey: 'cd'.repeat(32),
    operationHmacKey: 'ef'.repeat(32),
    webhookSecret: 'synthetic-reset-roundtrip-secret',
  };
  const issuer = `https://api.workos.com/user_management/${policy.clientId}`;
  const scope = createHash('sha256').update(`${policy.origin}|${policy.clientId}`).digest('hex');
  const token = 'synthetic-roundtrip-token-never-used-at-provider';
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const execute: StoreExecute = async (role, query, parameters, signal) => {
    signal.throwIfAborted();
    assert.equal(role, 'doji_business_session');
    assert.match(query, /^select business_session_private\.[a-z_0-9]+\(/);
    const statement = query.replace(/\$(\d+)/g, (_, index: string) => {
      const value = parameters[Number(index) - 1];
      assert.notEqual(value, undefined);
      return value === null
        ? 'null'
        : typeof value === 'number'
          ? String(value)
          : `'${String(value).replaceAll("'", "''")}'`;
    });
    return JSON.parse(sql(`set role doji_business_session;${statement};`));
  };
  sql(`truncate business_session_private.owned_auth_reset_links,business_session_private.owned_auth_tickets,business_session_private.owned_auth_buckets,business_session_private.owned_auth_resets,business_session_private.owned_auth_fences,business_session_private.records;
    update business_session_private.settings set scope_hash='${scope}';
    update business_session_private.owned_auth_settings set enabled=true,scope_hash='${scope}';`);
  try {
    const guard = createBusinessOwnedGuard(policy, execute),
      store = createBusinessOwnedResetStore(policy, execute);
    const signal = () => new AbortController().signal;
    await store.remember(
      {
        resetId: 'password_reset_roundtrip',
        subject: 'user_one',
        tokenHash,
        expires: Date.now() + 3600000,
      },
      guard.identityKey('roundtrip@test.invalid'),
      signal(),
    );
    let providerCalls = 0;
    const reset = () => {
      const persisted = createBusinessOwnedResetStore(policy, execute);
      return createBusinessOwnedReset(policy, {
        resolve: persisted.resolve,
        guard: {
          ...guard,
          beginReset: persisted.beginReset,
          completeReset: persisted.completeReset,
        },
        trustedClientIp: '192.0.2.1',
        verifyProof: async () => true,
        provider: {
          reset: async () => {
            providerCalls++;
            throw Error('simulated lost provider response');
          },
        },
      });
    };
    assert.deepEqual(await reset()(token, 'synthetic-new-password', 'offline', signal()), {
      step: 'reset-pending',
    });
    assert.equal(
      sql(
        'select count(*) from business_session_private.owned_auth_fences where pending_reset is not null;',
      ),
      '1',
    );
    assert.deepEqual(await reset()(token, 'synthetic-new-password', 'offline', signal()), {
      step: 'reset-pending',
    });
    assert.equal(providerCalls, 1);
    const raw = JSON.stringify({
      event: 'password_reset.succeeded',
      id: 'event_roundtrip',
      context: { client_id: policy.clientId },
      data: { object: 'password_reset', id: 'password_reset_roundtrip', user_id: 'user_one' },
    });
    const request = () => {
      const time = Date.now(),
        signature = createHmac('sha256', policy.webhookSecret)
          .update(`${time}.${raw}`)
          .digest('hex');
      return new Request(policy.origin + '/auth/owned/reset-events', {
        method: 'POST',
        body: raw,
        headers: {
          'content-type': 'application/json',
          'workos-signature': `t=${time},v1=${signature}`,
        },
      });
    };
    const webhook = createBusinessOwnedResetEvents(
      policy,
      createBusinessOwnedResetStore(policy, execute),
    );
    assert.equal((await webhook(request())).status, 200);
    assert.equal(
      sql(
        'select count(*) from business_session_private.owned_auth_fences where pending_reset is not null;',
      ),
      '0',
    );
    assert.deepEqual(await reset()(token, 'synthetic-new-password', 'offline', signal()), {
      step: 'reset-done',
    });
    const ticket = await guard.admit(
      'signin',
      guard.identityKey('roundtrip@test.invalid'),
      '192.0.2.1',
      signal(),
    );
    const verifiedActor = {
      realm: 'business' as const,
      issuer,
      audience: policy.clientId,
      subject: 'user_one',
      sessionId: 'session_fresh',
      mfaVerified: false,
      expiresAtSeconds: Math.floor(Date.now() / 1000) + 300,
    };
    await guard.install(
      ticket,
      'f'.repeat(64),
      'x'.repeat(64),
      Date.now() + 100000,
      verifiedActor,
      signal(),
    );
    assert.equal((await webhook(request())).status, 200);
    assert.equal(
      sql("select count(*) from business_session_private.records where key_hash=repeat('f',64);"),
      '1',
    );
    assert.equal(providerCalls, 1);
  } finally {
    sql(`update business_session_private.settings set scope_hash=repeat('a',64);
      update business_session_private.owned_auth_settings set scope_hash=repeat('a',64);`);
  }
}
