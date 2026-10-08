import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { createActionSecretCapture } from './business-action-secret-capture.mts';
test('local handoff validates origin, CSRF, wrong fields, visible success and no overwrite', async () => {
  let stored = '';
  const server = createActionSecretCapture((value) => {
    stored = value;
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const addr = server.address();
  assert.ok(addr && typeof addr !== 'string');
  const origin = `http://127.0.0.1:${addr.port}`;
  try {
    const get = await fetch(origin);
    const html = await get.text();
    const csrf = /name="csrf" value="([a-f0-9]+)"/.exec(html)?.[1];
    assert.ok(csrf);
    assert.equal(get.headers.get('referrer-policy'), 'same-origin');
    const post = (body: string, source = origin) =>
      fetch(origin + '/capture', {
        method: 'POST',
        redirect: 'manual',
        headers: { origin: source, 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });
    assert.equal(
      (await post('csrf=' + csrf + '&secret=' + 'a'.repeat(40), 'https://evil.invalid')).status,
      403,
    );
    assert.equal((await post('csrf=wrong&secret=' + 'a'.repeat(40))).status, 403);
    for (const secret of [
      'sk_' + 'a'.repeat(40),
      'client_' + 'a'.repeat(40),
      '',
      '••••••••••',
      '**********',
    ])
      assert.equal((await post(new URLSearchParams({ csrf, secret }).toString())).status, 400);
    const secret = 'synthetic-provider-value';
    const result = await post(new URLSearchParams({ csrf, secret }).toString());
    assert.equal(result.status, 303);
    assert.equal(stored, secret);
    const success = await (await fetch(origin)).text();
    assert.match(success, /Saved securely/);
    assert.ok(!success.includes(secret));
    assert.equal(
      (await post(new URLSearchParams({ csrf, secret: 'z'.repeat(40) }).toString())).status,
      409,
    );
    assert.equal(stored, secret);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => {
      server.close(() => r());
    });
  }
});
