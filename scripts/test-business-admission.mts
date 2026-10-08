import test from 'node:test';
import assert from 'node:assert/strict';
import { createBusinessAdmission } from '../infra/portal-identity-candidate/business-admission.mts';
const config = {
  origin: 'https://business.dojipro.com',
  turnstileSecret: 'synthetic-secret-'.repeat(3),
};
const client = { ip: '192.0.2.3' };
const input = () => ({ signup: true, proof: 'synthetic-proof', signal: AbortSignal.timeout(5000) });
test('business verification rejects invalid server configuration', () => {
  assert.throws(() =>
    createBusinessAdmission({ ...config, origin: 'https://admin.dojipro.com' }, client),
  );
  assert.throws(() => createBusinessAdmission({ ...config, turnstileSecret: '' }, client));
});
test('admission binds action, hostname, trusted IP and single bounded validation request', async () => {
  for (const signup of [true, false]) {
    const admit = createBusinessAdmission(config, client, async (url, init) => {
      assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
      assert.equal(init.redirect, 'error');
      assert.equal(init.method, 'POST');
      assert.deepEqual(JSON.parse(String(init.body)), {
        secret: config.turnstileSecret,
        response: 'synthetic-proof',
        remoteip: client.ip,
      });
      return Response.json({
        success: true,
        hostname: 'business.dojipro.com',
        action: signup ? 'business_register' : 'business_signin',
      });
    });
    assert.equal(await admit({ ...input(), signup }), true);
  }
});
test('invalid proof, missing IP and aborted requests fail before network', async () => {
  let calls = 0;
  const upstream = async () => {
    calls++;
    throw Error('Unexpected');
  };
  for (const proof of ['', 'x'.repeat(2049), null, 123])
    assert.equal(
      await createBusinessAdmission(config, client, upstream)({ ...input(), proof }),
      false,
    );
  for (const c of [{ ...client, ip: '' }])
    assert.equal(await createBusinessAdmission(config, c, upstream)(input()), false);
  assert.equal(
    await createBusinessAdmission(
      config,
      client,
      upstream,
    )({ ...input(), signal: AbortSignal.abort() }),
    false,
  );
  assert.equal(calls, 0);
});
test('provider denial, bad shape, wrong origin/action, oversized/invalid JSON and failure deny', async () => {
  for (const value of [
    null,
    {},
    { success: false },
    { success: true, hostname: 'admin.dojipro.com', action: 'business_register' },
    { success: true, hostname: 'business.dojipro.com', action: 'business_signin' },
  ])
    assert.equal(
      await createBusinessAdmission(config, client, async () => Response.json(value))(input()),
      false,
    );
  for (const response of [
    new Response(null, { status: 500 }),
    new Response('not-json'),
    new Response('x'.repeat(16385)),
  ])
    assert.equal(
      await createBusinessAdmission(config, client, async () => response)(input()),
      false,
    );
  assert.equal(
    await createBusinessAdmission(config, client, async () => {
      throw Error('private');
    })(input()),
    false,
  );
});
