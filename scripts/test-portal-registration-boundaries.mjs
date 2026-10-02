// Real registration signature/validation logic; injected SQL boundary only.
// No WorkOS accounts, network requests or database writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createHash } from 'node:crypto';
import { createBusinessRegistrationAction } from '../infra/portal-identity-candidate/business-registration-action.mjs';
const now = 1790890000000;
const config = {
  enabled: true,
  realm: 'business',
  clientId: 'client_test',
  origin: 'https://business.example.test',
  actionSecret: 'synthetic-action-secret-'.repeat(3),
};
const action = {
  object: 'user_registration_action_context',
  id: 'action_test',
  user_data: { object: 'user_data', email: 'synthetic@example.test' },
};
const signature = (raw, timestamp = now) =>
  createHmac('sha256', config.actionSecret).update(`${timestamp}.${raw}`).digest('hex');
const request = (body = action, options = {}) => {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const timestamp = options.timestamp ?? now;
  return new Request(options.url ?? `${config.origin}/auth/workos-registration`, {
    method: 'POST',
    body: raw,
    ...options,
    headers: {
      'content-type': 'application/json',
      'workos-signature': `t=${timestamp}, v1=${signature(raw, timestamp)}`,
      ...options.headers,
    },
  });
};
function fixture(result = true, patch = {}) {
  const calls = [];
  const handle = createBusinessRegistrationAction(
    { ...config, ...patch },
    async (...args) => {
      calls.push(args);
      if (result instanceof Error) throw result;
      return result;
    },
    () => now,
  );
  return { calls, handle };
}

for (const patch of [
  { realm: 'employee' },
  { clientId: '' },
  { origin: 'http://business.example.test' },
  { origin: `${config.origin}/path` },
  { actionSecret: null },
  { actionSecret: 'short' },
  { actionSecret: 'a'.repeat(257) },
])
  test(`reject invalid registration configuration ${JSON.stringify(patch)}`, () =>
    assert.throws(() => fixture(true, patch)));
test('missing executor rejects before admission', () =>
  assert.throws(() => createBusinessRegistrationAction(config, null)));

test('disabled registration never parses or reserves anything', async () => {
  const f = fixture(true, { enabled: false });
  assert.equal((await f.handle(request())).status, 503);
  assert.equal(f.calls.length, 0);
});
for (const url of [
  'https://admin.example.test/auth/workos-registration',
  `${config.origin}/other`,
  `${config.origin}/auth/workos-registration?extra=1`,
]) {
  test(`wrong registration route ${url} cannot reserve`, async () => {
    const f = fixture();
    assert.equal((await f.handle(request(action, { url }))).status, 404);
    assert.equal(f.calls.length, 0);
  });
}
test('non-POST registration cannot reserve', async () => {
  const f = fixture();
  assert.equal(
    (await f.handle(new Request(`${config.origin}/auth/workos-registration`))).status,
    404,
  );
  assert.equal(f.calls.length, 0);
});

for (const headers of [
  { 'content-type': 'text/plain' },
  { 'content-type': '' },
  { 'workos-signature': '' },
  { 'workos-signature': 't=123,v1=invalid' },
  { 'workos-signature': `t=${now},v1=${'0'.repeat(64)}` },
])
  test(`invalid registration headers ${JSON.stringify(headers)} never reach SQL`, async () => {
    const f = fixture();
    const response = await f.handle(request(action, { headers }));
    assert.equal(response.status, 401);
    assert.equal(f.calls.length, 0);
  });
for (const delta of [-30001, 30001])
  test(`timestamp outside replay window ${delta} is denied`, async () => {
    const f = fixture();
    assert.equal((await f.handle(request(action, { timestamp: now + delta }))).status, 401);
    assert.equal(f.calls.length, 0);
  });
for (const invalid of [
  'not JSON',
  null,
  { ...action, object: 'other' },
  { ...action, id: 4 },
  { ...action, id: 'a'.repeat(129) },
  { ...action, id: 'a/b' },
  { ...action, user_data: null },
  { ...action, user_data: { object: 'other', email: 'synthetic@example.test' } },
  { ...action, user_data: { object: 'user_data', email: 7 } },
  { ...action, user_data: { object: 'user_data', email: 'invalid-address' } },
  { ...action, user_data: { object: 'user_data', email: `${'a'.repeat(321)}@example.test` } },
  { ...action, extra: 'a'.repeat(17000) },
])
  test(`malformed signed action fails closed ${JSON.stringify(invalid).slice(0, 100)}`, async () => {
    const f = fixture();
    assert.equal((await f.handle(request(invalid))).status, 401);
    assert.equal(f.calls.length, 0);
  });

for (const result of [true, false, null, 'true', Error('private database details')]) {
  test(`reservation result ${String(result)} yields a signed exact verdict with no private data`, async () => {
    const f = fixture(result);
    const response = await f.handle(request());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const body = await response.json();
    assert.equal(body.object, 'user_registration_action_response');
    assert.equal(body.payload.verdict, result === true ? 'Allow' : 'Deny');
    assert.equal(body.signature, signature(JSON.stringify(body.payload), body.payload.timestamp));
    assert.equal('error_message' in body.payload, result !== true);
    assert.ok(!JSON.stringify(body).includes('private database details'));
    const [role, sql, params, signal] = f.calls[0];
    assert.equal(role, 'doji_business_registration');
    assert.equal(sql, 'select business_session_private.reserve_registration($1,$2,$3) as result');
    assert.equal(
      params[0],
      createHash('sha256').update(`${config.origin}|${config.clientId}`).digest('hex'),
    );
    assert.equal(params[1], createHash('sha256').update(action.id).digest('hex'));
    assert.equal(
      params[2],
      createHmac('sha256', config.actionSecret)
        .update('registration-payload|' + JSON.stringify(action))
        .digest('hex'),
    );
    assert.equal(signal.aborted, false);
  });
}

test('same action/payload produces stable reservation keys and does not include email in SQL arguments', async () => {
  const f = fixture();
  await f.handle(request());
  await f.handle(request());
  assert.deepEqual(f.calls[0].slice(0, 3), f.calls[1].slice(0, 3));
  assert.ok(f.calls[0][2].every((value) => /^[a-f0-9]{64}$/.test(value)));
});

test('aborted caller cannot get an Allow verdict after SQL completes', async () => {
  const controller = new AbortController();
  const handle = createBusinessRegistrationAction(
    config,
    async () => {
      controller.abort();
      return true;
    },
    () => now,
  );
  const response = await handle(request(action, { signal: controller.signal }));
  assert.equal((await response.json()).payload.verdict, 'Deny');
});
