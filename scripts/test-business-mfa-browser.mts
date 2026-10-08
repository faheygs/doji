import test from 'node:test';
import assert from 'node:assert/strict';
import { createBusinessBrowserClient } from '../infra/portal-identity-candidate/business-browser-client.mts';
function fixture() {
  let response: unknown = {},
    status = 200,
    assurance = 'aal1';
  const calls: string[] = [];
  const client = createBusinessBrowserClient(
    { origin: 'https://business.example.test', enabled: true, realm: 'business' },
    async (url, init) => {
      const path = new URL(url).pathname;
      calls.push(path);
      if (path === '/api/session')
        return Response.json({ signedIn: true, csrf: 'x'.repeat(43), assurance });
      assert.equal(new Headers(init.headers).get('x-doji-csrf'), 'x'.repeat(43));
      return Response.json(response, { status });
    },
  );
  return {
    client,
    calls,
    set: (value: unknown, code = 200) => {
      response = value;
      status = code;
    },
    assure: (value: string) => {
      assurance = value;
    },
  };
}
test('MFA prepare and enrollment require complete server response contracts', async () => {
  const f = fixture();
  await f.client.restore();
  for (const data of [null, [], {}, { challengeReady: false }]) {
    f.set(data);
    await assert.rejects(f.client.factors());
  }
  f.set({ enrollmentRequired: true });
  assert.deepEqual(await f.client.factors(), []);
  f.set({ challengeReady: true });
  assert.equal((await f.client.factors())[0]?.id, 'server-bound-challenge');
  for (const data of [
    [],
    {},
    { challengeReady: true },
    { challengeReady: true, enrollmentSecret: 123 },
    { challengeReady: true, enrollmentSecret: '<script>' },
  ]) {
    f.set(data);
    await assert.rejects(f.client.enroll());
  }
  f.set({ challengeReady: true, enrollmentSecret: 'ABCDEFGHIJKLMNOP' });
  assert.equal((await f.client.enroll()).totp.secret, 'ABCDEFGHIJKLMNOP');
});
test('verification never promotes browser assurance without authoritative restore', async () => {
  const f = fixture();
  await f.client.restore();
  const before = f.calls.length;
  await assert.rejects(f.client.verifyFactor('other-factor', '123456'));
  await assert.rejects(f.client.verifyFactor('server-bound-challenge', 'bad'));
  assert.equal(f.calls.length, before);
  for (const data of [[], {}, { assurance: 'aal1' }]) {
    f.set(data);
    await assert.rejects(f.client.verifyFactor('server-bound-challenge', '123456'));
  }
  f.set({ assurance: 'aal2' });
  await assert.rejects(f.client.verifyFactor('server-bound-challenge', '123456'));
  assert.equal(f.client.assurance(), 'aal1');
  f.assure('aal2');
  await f.client.verifyFactor('server-bound-challenge', '123456');
  assert.equal(f.client.assurance(), 'aal2');
});
test('wrong-code and uncertain failures preserve session, authorization failures clear it', async () => {
  for (const status of [400, 429, 503, 401, 403]) {
    const f = fixture();
    await f.client.restore();
    f.set({}, status);
    await assert.rejects(
      f.client.verifyFactor('server-bound-challenge', '123456'),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal('restartMfa' in error, ![401, 403].includes(status));
        return true;
      },
    );
    assert.equal(f.client.hasSession(), ![401, 403].includes(status));
    assert.equal(f.calls.filter((path) => path === '/auth/mfa/complete').length, 1);
  }
});
test('workspace rejects partial or enabled paid-feature responses and projects safe fields', async () => {
  const f = fixture();
  await f.client.restore();
  const valid = {
    organization_id: 'org',
    brand_name: 'Example',
    role: 'owner',
    campaigns_enabled: false,
    billing_enabled: false,
  };
  for (const key of Object.keys(valid)) {
    const value: Record<string, unknown> = { ...valid };
    delete value[key];
    f.set(value);
    await assert.rejects(f.client.workspace());
  }
  for (const value of [
    null,
    [],
    { ...valid, campaigns_enabled: true },
    { ...valid, billing_enabled: true },
  ]) {
    f.set(value);
    await assert.rejects(f.client.workspace());
  }
  f.set({ ...valid, unrelated_private_field: 'must not reach presentation' });
  assert.deepEqual(await f.client.workspace(), { brand: 'Example', role: 'owner' });
});
