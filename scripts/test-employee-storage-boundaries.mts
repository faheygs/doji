import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmployeeStorageSigner } from '../infra/portal-identity-candidate/employee-storage-signer.mts';
import type { PortalFetch } from '../infra/portal-identity-candidate/portal-contracts.mts';
import { present } from './employee-test-fixtures.mts';
const origin = 'https://abcdefghijklmnopqrst.supabase.co';
const config = { origin, serviceKey: 'synthetic-not-a-service-key-'.repeat(3) };
const evidence = {
  bucket: 'moderation-evidence',
  path: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/original',
  expiresIn: 300,
};
const signal = () => AbortSignal.timeout(1000);
for (const patch of [
  { origin: 'http://example.test' },
  { serviceKey: null },
  { serviceKey: 'short' },
]) {
  test(`invalid evidence signer config ${JSON.stringify(patch)}`, () =>
    assert.throws(() =>
      Reflect.apply(createEmployeeStorageSigner, undefined, [{ ...config, ...patch }]),
    ));
}
test('invalid evidence and nonstandard expiry never send requests', async () => {
  let sent = 0;
  const sign = createEmployeeStorageSigner(config, async () => {
    sent++;
    throw Error('Invalid evidence must never reach transport');
  });
  for (const ref of [
    { ...evidence, bucket: 'unknown-bucket' },
    { ...evidence, path: '../private' },
    { ...evidence, expiresIn: 3600 },
  ])
    await assert.rejects(sign(ref, signal()));
  assert.equal(sent, 0);
});

test('signer uses a fixed origin, bounded TTL and encoded object path with server-only credentials', async () => {
  const calls: Parameters<PortalFetch>[] = [];
  const reference = { bucket: 'post-media', path: 'synthetic owner/file name.jpg', expiresIn: 300 };
  const signedURL = '/object/sign/post-media/synthetic%20owner/file%20name.jpg?token=synthetic';
  const sign = createEmployeeStorageSigner(config, async (...args) => {
    calls.push(args);
    return Response.json({ signedURL });
  });
  assert.equal(await sign(reference, signal()), origin + '/storage/v1' + signedURL);
  assert.equal(calls.length, 1);
  const [url, rawOptions] = present(calls[0]);
  const options = present(rawOptions);
  assert.equal(
    url,
    origin + '/storage/v1/object/sign/post-media/synthetic%20owner/file%20name.jpg',
  );
  assert.equal(options.method, 'POST');
  assert.equal(options.redirect, 'error');
  assert.equal(typeof options.body, 'string');
  if (typeof options.body !== 'string') assert.fail('Expected serialized body');
  assert.deepEqual(JSON.parse(options.body), { expiresIn: 300 });
  assert.equal(new Headers(options.headers).get('authorization'), `Bearer ${config.serviceKey}`);
  assert.equal(new Headers(options.headers).get('apikey'), config.serviceKey);
  assert.ok(options.signal);
  assert.equal(options.signal.aborted, false);
});

for (const body of [
  {},
  { signedURL: 4 },
  { signedURL: 'https://evil.example.test/' },
  { signedURL: '/object/sign/avatars/wrong-bucket' },
]) {
  test(`invalid signing response ${JSON.stringify(body)} cannot escape the storage origin/bucket`, async () => {
    const sign = createEmployeeStorageSigner(config, async () => Response.json(body));
    await assert.rejects(sign(evidence, signal()), /Invalid signing response/);
  });
}
test('failed provider response never leaks its private body', async () => {
  const sign = createEmployeeStorageSigner(
    config,
    async () => new Response('private provider details', { status: 503 }),
  );
  await assert.rejects(sign(evidence, signal()), { message: 'Evidence signing unavailable' });
});
test('oversized signing response is rejected', async () => {
  const sign = createEmployeeStorageSigner(config, async () =>
    Response.json({ signedURL: 'a'.repeat(9000) }),
  );
  await assert.rejects(sign(evidence, signal()));
});
test('caller abort is propagated to the signer request', async () => {
  const controller = new AbortController();
  const sign = createEmployeeStorageSigner(config, async (_url, options) => {
    controller.abort(Error('cancelled'));
    assert.ok(options?.signal);
    options.signal.throwIfAborted();
    assert.fail('Caller abort must propagate');
  });
  await assert.rejects(sign(evidence, controller.signal), /cancelled/);
});
