// Actual browser transport -> Pages proxy -> ingress -> runtime -> SQL/provider adapters.
// Only the socket/database/provider I/O is synthetic. No remote traffic or email.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { businessFixture, businessConfig } from './business-runtime-fixture.mts';
import { createBusinessProxy } from '../infra/portal-identity-candidate/business-proxy.mts';
import { createOwnedAccessTransport } from '../web/apps/business/src/owned-access-transport.ts';
import { createRestrictedSql } from '../infra/portal-identity-candidate/restricted-sql.mts';
import { businessOwnedSql } from '../infra/portal-identity-candidate/business-owned-sql.mts';
import { createBusinessSessionStore } from '../infra/portal-identity-candidate/business-session-store.mts';
import { ownedDiagnostic } from '../infra/portal-identity-candidate/business-owned-diagnostics.mts';
const ownedAuth = {
  enabled: true,
  sendingEnabled: true,
  admissionHmacKey: 'cd'.repeat(32),
  operationHmacKey: 'de'.repeat(32),
  webhookSecret: 'synthetic-reset-webhook-'.repeat(3),
  recoveryEmail: {
    enabled: true,
    workosDefaultEmailDisabled: true,
    trackingDisabled: true,
    capacityApprovedUntil: Date.now() + 3600000,
    apiKey: 're_' + 'x'.repeat(24),
    from: 'Doji <support@dojipro.com>',
  },
};
async function fixture(sendingEnabled = true, proofAction?: string, acceptanceOnly = false) {
  const f = await businessFixture({
    ownedAuth: { ...ownedAuth, sendingEnabled, acceptanceOnly },
    ...(acceptanceOnly ? { signupEnabled: false } : {}),
  });
  let jar = '',
    resetToken = 'synthetic-reset-token-123456';
  const proxy = createBusinessProxy(
    { ...businessConfig, ownedAuthEnabled: true },
    async (url, init) => f.runtime(new Request(url, init)),
  );
  const client = createOwnedAccessTransport(
    { ...businessConfig, enabled: true },
    {
      currentOrigin: businessConfig.origin,
      proof: async (action) => {
        f.proofAction(proofAction ?? `business_${action}`);
        return 'synthetic';
      },
      resetLink: {
        available: () => Boolean(resetToken),
        take: () => {
          const token = resetToken;
          resetToken = '';
          return token;
        },
      },
      request: async (url, init) => {
        const headers = new Headers(init?.headers);
        headers.set('origin', businessConfig.origin);
        headers.set('sec-fetch-site', 'same-origin');
        headers.set('cf-connecting-ip', '192.0.2.1');
        headers.set('cookie', jar);
        const result = await proxy(new Request(String(url), { ...init, headers }));
        const cookies = new Map(
          jar
            .split('; ')
            .filter(Boolean)
            .map((v) => v.split('=') as [string, string]),
        );
        for (const value of result.headers.getSetCookie()) {
          const [name, token] = value.split(';')[0]!.split('=');
          if (token) cookies.set(name!, token);
          else cookies.delete(name!);
        }
        jar = [...cookies].map(([name, token]) => `${name}=${token}`).join('; ');
        return result;
      },
    },
  );
  return { ...f, client, proxy, cookie: () => jar };
}
const signal = () => new AbortController().signal;
const credentials = { email: 'sample@example.com', password: 'synthetic-password' };
function signedResetEvent(valid = true, clockOffset = 0) {
  const timestamp = Date.now() + clockOffset;
  const body = JSON.stringify({
    id: 'event_synthetic',
    event: 'password_reset.succeeded',
    context: { client_id: businessConfig.clientId },
    data: { object: 'password_reset', id: 'password_reset_synthetic', user_id: 'user_synthetic' },
  });
  const signature = createHmac('sha256', ownedAuth.webhookSecret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  return new Request(businessConfig.origin + '/auth/owned/reset-events', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'workos-signature': `t=${timestamp},v1=${valid ? signature : '0'.repeat(64)}`,
      cookie: '__Host-doji_employee=private',
    },
  });
}
test('business maintenance blocks new work at both boundaries but preserves signed recovery', async () => {
  const f = await businessFixture({ ownedAuth, maintenanceEnabled: true });
  const proxy = createBusinessProxy(
    { ...businessConfig, ownedAuthEnabled: true, maintenanceEnabled: true },
    async (url, init) => f.runtime(new Request(url, init)),
  );
  for (const path of [
    '/auth/owned/bootstrap',
    '/auth/owned/signin',
    '/auth/owned/reset',
    '/api/session',
    '/api/application',
  ]) {
    assert.equal((await f.runtime(f.request(path))).status, 503);
    assert.equal((await proxy(new Request(businessConfig.origin + path))).status, 503);
  }
  assert.equal(f.calls.length + f.queries.length, 0);
  assert.equal((await proxy(signedResetEvent())).status, 200);
  assert.ok(
    f.queries.some(
      (q) => typeof q === 'object' && q.text.includes('reconcile_owned_reset_link_v1'),
    ),
  );
  assert.equal(f.calls.length, 0);
});

test('owned runtime signs in through guarded SQL and existing authorized session restore', async () => {
  const f = await fixture();
  assert.deepEqual(await f.client.transport('signin', credentials, signal()), { step: 'complete' });
  assert.match(f.cookie(), /^__Host-doji_business=/);
  assert.equal((await f.runtime(f.request('/api/session', undefined, f.cookie()))).status, 200);
  assert.ok(
    f.queries.some((q) => typeof q === 'object' && q.text.includes('put_owned_session_v1')),
  );
  assert.ok(!f.queries.some((q) => typeof q === 'object' && q.text.includes('put_bound_session')));
  f.client.dispose();
});
test('owned registration reserves and verifies before enrollment, preserving original admission', async () => {
  const f = await fixture();
  assert.deepEqual(
    await f.client.transport(
      'register',
      { ...credentials, termsAccepted: true, privacyAcknowledged: true },
      signal(),
    ),
    { step: 'verify' },
  );
  assert.ok(!f.cookie().includes('__Host-doji_business='));
  assert.deepEqual(await f.client.transport('verify', { code: '123456' }, signal()), {
    step: 'complete',
  });
  const queries = f.queries.filter((q) => typeof q === 'object');
  const admitted = queries.find((q) => q.text.includes('admit_owned_auth_v1'))!;
  const installed = queries.find((q) => q.text.includes('put_owned_session_v1'))!;
  assert.equal(installed.values[1], admitted.values[2]);
  assert.equal(queries.filter((q) => q.text.includes('reserve_registration')).length, 1);
  assert.ok(queries.some((q) => q.text.includes('complete_business_enrollment')));
  f.client.dispose();
});

test('acceptance permits one approved registration without opening the public pilot', async () => {
  const f = await fixture(true, undefined, true);
  const input = { ...credentials, termsAccepted: true, privacyAcknowledged: true };
  assert.deepEqual(await f.client.transport('register', input, signal()), { step: 'verify' });
  await assert.rejects(f.client.transport('register', input, signal()));
  assert.equal(f.calls.filter((url) => url.endsWith('/users')).length, 1);
  assert.ok(
    !f.queries.some((q) => typeof q === 'object' && q.text.includes('reserve_registration(')),
  );
  assert.deepEqual(await f.client.transport('verify', { code: '123456' }, signal()), {
    step: 'complete',
  });
  f.client.dispose();
});

test('acceptance denies other identities before provider, proof delivery, or enrollment', async () => {
  const f = await fixture(true, undefined, true);
  for (const action of ['register', 'signin', 'recover'] as const) {
    await assert.rejects(
      f.client.transport(
        action,
        {
          email: 'different@example.com',
          password: credentials.password,
          termsAccepted: true,
          privacyAcknowledged: true,
        },
        signal(),
      ),
    );
  }
  assert.equal(f.calls.length, 0);
  assert.ok(
    !f.queries.some(
      (q) => typeof q === 'object' && q.text.includes('complete_business_enrollment'),
    ),
  );
  f.client.dispose();
});

test('acceptance expires for continuations and cannot be combined with public signup', async () => {
  await assert.rejects(businessFixture({ ownedAuth: { ...ownedAuth, acceptanceOnly: true } }));
  const f = await fixture(true, undefined, true);
  await f.client.transport(
    'register',
    { ...credentials, termsAccepted: true, privacyAcknowledged: true },
    signal(),
  );
  f.advance(7200001);
  const calls = f.calls.length;
  await assert.rejects(f.client.transport('verify', { code: '123456' }, signal()));
  await assert.rejects(f.client.transport('signin', credentials, signal()));
  await assert.rejects(f.client.transport('recover', { email: credentials.email }, signal()));
  assert.equal(f.calls.length, calls);
  assert.equal((await f.proxy(signedResetEvent(true, 7200001))).status, 200);
  f.client.dispose();
});
test('recovery mapping and reset traverse the full runtime without authenticating', async () => {
  const f = await fixture();
  assert.deepEqual(await f.client.transport('recover', { email: credentials.email }, signal()), {
    step: 'check-email',
  });
  assert.deepEqual(await f.client.transport('reset', { password: 'new-password' }, signal()), {
    step: 'reset-done',
  });
  assert.equal(f.cookie(), '');
  assert.equal(f.calls.filter((url) => url.endsWith('/password_reset/confirm')).length, 1);
  assert.ok(!f.calls.some((url) => url.endsWith('/authenticate')));
  f.client.dispose();
});
test('sending-off blocks all auth work, but signed recovery evidence remains available', async () => {
  const f = await fixture(false);
  await assert.rejects(f.client.transport('signin', credentials, signal()));
  assert.equal(f.calls.length + f.queries.length, 0);
  const result = await f.proxy(signedResetEvent());
  assert.equal(result.status, 200);
  assert.equal(f.calls.length, 0);
  assert.ok(
    f.queries.some(
      (q) => typeof q === 'object' && q.text.includes('reconcile_owned_reset_link_v1'),
    ),
  );
  f.client.dispose();
});
test('owned mode blocks legacy login, callback and registration before provider or SQL', async () => {
  const f = await fixture();
  for (const path of [
    '/auth/start',
    '/auth/callback?code=old&state=old',
    '/auth/workos-registration',
  ]) {
    const request = f.request(path, path.includes('callback') ? undefined : {});
    assert.equal((await f.runtime(request)).status, 404);
    assert.equal(
      (
        await f.proxy(
          new Request(businessConfig.origin + path, {
            method: request.method,
            headers: { origin: businessConfig.origin },
          }),
        )
      ).status,
      404,
    );
  }
  assert.equal(f.calls.length + f.queries.length, 0);
});
test('owned SQL allowlist is opt-in business-only and blocks both unfenced installers before sockets', async () => {
  let calls = 0;
  const createClient = () => {
    calls++;
    throw Error('Unexpected socket');
  };
  const config = { ...businessConfig.database, realm: 'business' as const };
  const off = createRestrictedSql(config, createClient);
  for (const [sql, count] of Object.entries(businessOwnedSql))
    await assert.rejects(
      off('doji_business_session', sql, Array(count).fill('synthetic'), signal()),
    );
  const on = createRestrictedSql({ ...config, ownedBusinessAuth: true }, createClient);
  await assert.rejects(
    on(
      'doji_business_session',
      'select business_session_private.put_bound_session($1,$2,$3,$4::integer,$5,$6,$7,$8) as result',
      Array(8).fill('x'),
      signal(),
    ),
  );
  await assert.rejects(
    on(
      'doji_business_session',
      'select business_session_private.execute_store($1,$2,$3,$4,$5,$6::integer,$7,$8) as result',
      ['a'.repeat(64), 'put', 'session', 'b'.repeat(64), 'x'.repeat(64), 1000, null, null],
      signal(),
    ),
  );
  assert.throws(() =>
    createRestrictedSql({ ...config, realm: 'employee', ownedBusinessAuth: true }, createClient),
  );
  assert.equal(calls, 0);
});

test('absent runtime opt-in rejects owned routes without I/O; contradictory modes cannot start', async () => {
  const f = await businessFixture();
  for (const path of ['/auth/owned/bootstrap', '/auth/owned/signin', '/auth/owned/reset-events'])
    assert.equal((await f.runtime(f.request(path))).status, 404);
  assert.equal(f.calls.length + f.queries.length, 0);
  await assert.rejects(businessFixture({ ownedAuth, ownedAuthEnabled: false }), /mode mismatch/);
  await assert.rejects(
    businessFixture({ ownedAuth: { ...ownedAuth, operationHmacKey: ownedAuth.admissionHmacKey } }),
  );
});

test('wrong action proof spends admission but cannot call account provider or install a session', async () => {
  const f = await fixture(true, 'business_register');
  await assert.rejects(f.client.transport('signin', credentials, signal()));
  assert.ok(f.queries.some((q) => typeof q === 'object' && q.text.includes('admit_owned_auth_v1')));
  assert.equal(f.calls.filter((url) => url.includes('api.workos.com')).length, 0);
  assert.ok(!f.cookie().includes('__Host-doji_business='));
  f.client.dispose();
});

test('lost reset stays fenced until exact signed recovery; no automatic provider redispatch', async () => {
  const f = await fixture();
  await f.client.transport('recover', { email: credentials.email }, signal());
  f.loseReset();
  assert.deepEqual(await f.client.transport('reset', { password: 'new-password' }, signal()), {
    step: 'reset-pending',
  });
  await assert.rejects(f.client.transport('signin', credentials, signal()));
  assert.ok(!f.cookie().includes('__Host-doji_business='));
  const before = f.queries.length;
  assert.notEqual((await f.proxy(signedResetEvent(false))).status, 200);
  assert.equal(f.queries.length, before);
  assert.equal((await f.proxy(signedResetEvent())).status, 200);
  assert.deepEqual(await f.client.transport('signin', credentials, signal()), { step: 'complete' });
  assert.equal((await f.runtime(f.request('/api/session', undefined, f.cookie()))).status, 200);
  assert.equal(f.calls.filter((url) => url.endsWith('/password_reset/confirm')).length, 1);
  f.client.dispose();
});

test('owned session store pins its mode and refuses legacy installation before SQL', async () => {
  const config = { ...businessConfig, ownedAuthEnabled: true };
  let calls = 0;
  const store = createBusinessSessionStore(config, async (_role, sql) => {
    calls++;
    assert.ok(sql.includes('execute_owned_store_v1'));
    return { state: 'ok' };
  });
  config.ownedAuthEnabled = false;
  await assert.rejects(store.putSession('a'.repeat(64), 'value', Date.now() + 1000));
  assert.equal(calls, 0);
  await store.putFlow('b'.repeat(64), 'envelope', Date.now() + 1000);
  assert.equal(calls, 1);
});

test('runtime diagnostics only permit fixed categories and cannot throw into auth', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  ownedDiagnostic('reset_pending');
  assert.deepEqual(
    warn.mock.calls.map((call) => call.arguments),
    [['business_owned_auth', 'reset_pending']],
  );
  // @ts-expect-error Untrusted diagnostics must be discarded even at runtime.
  ownedDiagnostic('https://business.dojipro.com/?token=private');
  assert.equal(warn.mock.calls.length, 1);
  warn.mock.mockImplementation(() => {
    throw Error('Log transport unavailable');
  });
  assert.doesNotThrow(() => ownedDiagnostic('recovery_mapping_failed'));
});
