import test from 'node:test';
import assert from 'node:assert/strict';
import { businessFixture, businessConfig } from './business-runtime-fixture.mts';
import { createBusinessRuntime } from '../infra/portal-identity-candidate/business-runtime.mts';
test('runtime refuses cross-realm configuration', async () => {
  await assert.rejects(businessFixture({ origin: 'https://admin.dojipro.com' }));
  assert.throws(() =>
    Reflect.apply(createBusinessRuntime, undefined, [
      { ...businessConfig, realm: 'employee' },
      { createClient: () => {} },
    ]),
  );
});

test('business MFA requires session and CSRF; server receipt survives restore without changing identity', async () => {
  const f = await businessFixture();
  const callback = await f.runtime(await f.begin());
  const cookie = callback.headers
    .getSetCookie()
    .find((c) => c.startsWith('__Host-doji_business='))!
    .split(';')[0]!;
  const session = (await (
    await f.runtime(f.request('/api/session', undefined, cookie))
  ).json()) as { csrf: string; assurance: string };
  assert.equal(session.assurance, 'aal1');
  const before = f.calls.length;
  assert.equal(
    (await f.runtime(f.request('/auth/mfa/prepare', { enroll: false }, cookie))).status,
    403,
  );
  assert.equal(f.calls.length, before);
  const headers = { 'x-doji-csrf': session.csrf };
  assert.equal(
    (await f.runtime(f.request('/auth/mfa/prepare', { enroll: false }, cookie, headers))).status,
    200,
  );
  const response = await f.runtime(
    f.request('/auth/mfa/complete', { code: '123456' }, cookie, headers),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { assurance: 'aal2' });
  const restored = (await (
    await f.runtime(f.request('/api/session', undefined, cookie))
  ).json()) as { assurance: string };
  assert.equal(restored.assurance, 'aal2');
  const workspace = await f.runtime(f.request('/api/workspace', undefined, cookie));
  assert.equal(workspace.status, 200);
  assert.equal(((await workspace.json()) as { billing_enabled: boolean }).billing_enabled, false);
  assert.equal(
    (await f.runtime(f.request('/auth/mfa/complete', { code: '123456' }, cookie, headers))).status,
    403,
  );
  assert.equal((await f.runtime(f.request('/api/session', undefined, cookie))).status, 401);
  f.revoke();
  assert.equal((await f.runtime(f.request('/api/session', undefined, cookie))).status, 401);
});
test('disabled/anonymous/forged ingress never calls provider or database', async () => {
  const disabled = await businessFixture({ enabled: false });
  assert.equal((await disabled.runtime(disabled.request('/api/session'))).status, 503);
  assert.equal(disabled.calls.length + disabled.queries.length, 0);
  const f = await businessFixture();
  assert.equal((await f.runtime(f.request('/api/session'))).status, 401);
  assert.equal(
    (await f.runtime(f.request('/api/session', undefined, '', { 'x-doji-portal-proxy-key': '' })))
      .status,
    403,
  );
  assert.equal(f.calls.length + f.queries.length, 0);
});
test('actual composition enrolls business, restores cookie session and denies revoked provider session', async () => {
  const f = await businessFixture();
  const callback = await f.begin();
  const result = await f.runtime(callback);
  assert.equal(result.status, 303);
  assert.equal(
    result.headers.get('location'),
    businessConfig.origin + '/business-portal/application/',
  );
  const cookie = result.headers
    .getSetCookie()
    .find((c) => c.startsWith('__Host-doji_business='))
    ?.split(';')[0];
  assert.ok(cookie);
  const session = await f.runtime(f.request('/api/session', undefined, cookie));
  assert.equal(session.status, 200);
  const payload: unknown = await session.json();
  assert.ok(payload && typeof payload === 'object' && 'assurance' in payload);
  assert.equal(payload.assurance, 'aal1');
  assert.equal((await f.runtime(f.request('/api/application', undefined, cookie))).status, 200);
  assert.equal(f.calls.filter((c) => c.includes('/sso/jwks/')).length, 1);
  assert.ok(
    f.queries.some((q) => typeof q === 'object' && q.text.includes('complete_business_enrollment')),
  );
  f.revoke();
  assert.equal((await f.runtime(f.request('/api/session', undefined, cookie))).status, 401);
  const reads = f.calls.length;
  assert.equal((await f.runtime(f.request('/api/session', undefined, cookie))).status, 401);
  assert.equal(f.calls.length, reads);
});
test('concurrent callbacks share key retrieval; expired key cache never falls back on failed refresh', async () => {
  const f = await businessFixture();
  const pending = await Promise.all([f.begin(), f.begin()]);
  const results = await Promise.all(pending.map(f.runtime));
  assert.ok(
    results.every((r) => r.status === 303 && r.headers.get('location')?.endsWith('/application/')),
  );
  assert.equal(f.calls.filter((c) => c.includes('/sso/jwks/')).length, 1);
  f.advance(300001);
  f.keys(() => new Response(null, { status: 503 }));
  const failed = await f.runtime(await f.begin());
  assert.ok(failed.headers.get('location')?.endsWith('?signin=failed'));
  assert.equal(f.calls.filter((c) => c.includes('/sso/jwks/')).length, 2);
});
test('invalid key responses cannot establish a business session', async () => {
  for (const data of [null, { keys: [{}] }, { keys: [] }, { keys: [{ kty: 'RSA' }] }]) {
    const f = await businessFixture();
    f.keys(() => Response.json(data));
    const result = await f.runtime(await f.begin());
    assert.ok(result.headers.get('location')?.endsWith('?signin=failed'));
    assert.ok(!result.headers.getSetCookie().some((c) => c.startsWith('__Host-doji_business=')));
  }
});
test('registration routes to signed handler, not browser admission or provider', async () => {
  const f = await businessFixture();
  const result = await f.runtime(f.request('/auth/workos-registration', {}));
  assert.equal(result.status, 401);
  assert.equal(f.calls.length + f.queries.length, 0);
});
