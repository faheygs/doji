import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createCaptureServer, parseStagingPair } from './workos-staging-capture-form.mjs';

// Loopback-only, fake credentials, memory persistence. No WorkOS/filesystem writes.
const expected = {
  business: { clientId: 'client_business_test', environment: 'test-business' },
  employee: { clientId: 'client_employee_test', environment: 'test-employee' },
};
const key = (realm) => 'sk_' + realm.repeat(8);
const block = (realm) =>
  `WORKOS_API_KEY="${key(realm)}"\nWORKOS_CLIENT_ID="${expected[realm].clientId}"`;
for (const realm of ['business', 'employee']) {
  for (const separator of ['\n', '\r\n', '']) {
    assert.equal(
      parseStagingPair(block(realm).replace('\n', separator), expected[realm].clientId),
      key(realm),
    );
    assert.equal(
      parseStagingPair(
        block(realm).replaceAll('"', '').replace('\n', separator),
        expected[realm].clientId,
      ),
      key(realm),
    );
  }
}
assert.throws(() => parseStagingPair(block('business'), expected.employee.clientId));
assert.throws(() =>
  parseStagingPair(block('business') + '\n' + block('business'), expected.business.clientId),
);
let persisted;
let saves = 0;
const server = createCaptureServer({
  expected,
  port: 4198,
  persist: (value) => {
    persisted = value;
    saves++;
  },
});
server.listen(4198, '127.0.0.1');
await once(server, 'listening');
try {
  const origin = 'http://127.0.0.1:4198';
  let response = await fetch(origin);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  // A native HTML POST under no-referrer sends Origin:null, unlike fetch's
  // default CORS mode. Pin a policy compatible with the strict origin guard.
  // https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy
  assert.equal(response.headers.get('referrer-policy'), 'same-origin');
  const html = await response.text();
  assert.ok(html.includes('Save both credentials'));
  const csrf = html.match(/name="csrf" value="([a-f0-9]+)"/)[1];
  const post = (fields, headerOrigin = origin) =>
    fetch(origin + '/capture', {
      method: 'POST',
      redirect: 'manual',
      headers: { Origin: headerOrigin },
      body: new URLSearchParams(fields),
    });
  const fields = {
    csrf,
    business: block('business').replace('\n', ''),
    employee: block('employee'),
  };
  response = await post(fields, 'https://untrusted.invalid');
  assert.equal(response.status, 403);
  response = await post(fields, 'null');
  assert.equal(response.status, 403);
  assert.equal(saves, 0);
  response = await post({ ...fields, csrf: 'stale' });
  assert.equal(response.status, 400);
  response = await post({ ...fields, employee: block('business') });
  assert.equal(response.status, 400);
  let body = await response.text();
  assert.ok(body.includes('different environment'));
  assert.ok(!body.includes(key('business')));
  assert.equal(saves, 0);
  response = await post({ ...fields, employee: 'x'.repeat(17000) });
  assert.equal(response.status, 413);
  response = await post(fields);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/saved');
  assert.equal(saves, 1);
  assert.equal(persisted.business.apiKey, key('business'));
  assert.equal(persisted.employee.apiKey, key('employee'));
  response = await fetch(origin + '/saved');
  body = await response.text();
  assert.ok(body.includes('Both staging credentials saved'));
  assert.ok(!body.includes(key('employee')));
  await post(fields);
  assert.equal(saves, 1);
  console.log(
    'PASS: paste parsing, exact directories, CSRF/origin, size limit, no secret echo, complete save, success receipt and duplicate protection. Fake data only.',
  );
} finally {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
