// Actual candidate business browser/provider code; no real provider or database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBusinessBrowserClient } from '../infra/portal-identity-candidate/business-browser-client.mjs';
import { createWorkosBusinessProvider } from '../infra/portal-identity-candidate/workos-business-provider.mjs';
const config = { enabled: true, realm: 'business', origin: 'https://business.example.test' };
const validSession = { signedIn: true, csrf: 'a'.repeat(43), assurance: 'aal1' };
const application = { id: 'application-id', revision: 1, state: 'draft', details: {} };
const destination =
  'https://api.workos.com/user_management/authorize?redirect_uri=' +
  encodeURIComponent(config.origin + '/auth/callback');
function fixture(handler = () => Response.json(validSession)) {
  const calls = [];
  const client = createBusinessBrowserClient(config, async (url, options) => {
    calls.push({ url, options });
    return handler(url, options);
  });
  return { client, calls };
}
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

for (const patch of [
  { enabled: false },
  { realm: 'employee' },
  { origin: 'http://business.example.test' },
  { origin: config.origin + '/path' },
]) {
  test(`business browser rejects invalid config ${JSON.stringify(patch)}`, () =>
    assert.throws(() => createBusinessBrowserClient({ ...config, ...patch })));
}
for (const response of [
  null,
  { ...validSession, signedIn: false },
  { ...validSession, csrf: '' },
  { ...validSession, csrf: null },
  { ...validSession, assurance: 'aal3' },
]) {
  test(`malformed business session ${JSON.stringify(response)} never authorizes`, async () => {
    const { client } = fixture(() => Response.json(response));
    await assert.rejects(client.restore());
    assert.equal(client.hasSession(), false);
    assert.equal(client.assurance(), null);
  });
}
test('business restore coalesces concurrent reads and failed JSON does not authorize', async () => {
  const pending = deferred();
  const { client, calls } = fixture(() => pending.promise);
  const first = client.restore();
  const second = client.restore();
  assert.equal(first, second);
  pending.resolve(new Response('unreadable'));
  await assert.rejects(first, /could not be read/);
  assert.equal(calls.length, 1);
  assert.equal(client.hasSession(), false);
});
test('401 restore becomes signed-out but other HTTP errors remain errors', async () => {
  for (const status of [401, 403, 503]) {
    const { client } = fixture(() => Response.json({ error: 'private details' }, { status }));
    if (status === 401) assert.equal(await client.restore(), false);
    else await assert.rejects(client.restore(), { status });
    assert.equal(client.hasSession(), false);
  }
});
test('clear fences a pending restore and notifies only subscribed listeners', async () => {
  const pending = deferred();
  const { client } = fixture(() => pending.promise);
  let active = 0,
    unsubscribed = 0;
  client.onClear(() => {
    active++;
  });
  const unsubscribe = client.onClear(() => {
    unsubscribed++;
  });
  unsubscribe();
  const task = client.restore();
  const generation = client.epoch();
  client.clear();
  pending.resolve(Response.json(validSession));
  await assert.rejects(task, /session has ended/);
  assert.equal(client.epoch(), generation + 1);
  assert.equal(active, 1);
  assert.equal(unsubscribed, 0);
  assert.equal(client.hasSession(), false);
});
test('signed-out reads and commands never reach transport; signout remains local', async () => {
  const { client, calls } = fixture();
  await assert.rejects(client.read(), /Sign in with your business account/);
  await assert.rejects(client.command({ action: 'save' }), /Sign in with your business account/);
  await client.signout();
  assert.equal(calls.length, 0);
});
test('valid restore gives opaque cookie transport and another restore is fresh', async () => {
  const { client, calls } = fixture(() => Response.json({ ...validSession, assurance: 'aal2' }));
  assert.equal(await client.restore(), true);
  assert.equal(client.assurance(), 'aal2');
  await client.restore();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.redirect, 'error');
  assert.deepEqual(calls[0].options.headers, {});
});
for (const response of [
  null,
  {},
  { ...application, id: null },
  { ...application, revision: 0 },
  { ...application, state: 'unknown' },
  { ...application, details: [] },
]) {
  test(`application read validates its response ${JSON.stringify(response)}`, async () => {
    const { client } = fixture((url) =>
      Response.json(url.endsWith('/session') ? validSession : response),
    );
    await client.restore();
    if (response === null) assert.equal(await client.read(), null);
    else await assert.rejects(client.read(), /application response could not be verified/);
  });
}
test('commands require a verified application receipt and preserve exact request body and CSRF', async () => {
  let commandResponse = { application };
  const { client, calls } = fixture((url) =>
    Response.json(url.endsWith('/session') ? validSession : commandResponse),
  );
  await client.restore();
  const body = { action: 'save', requestId: 'stable-retry-id' };
  assert.deepEqual(await client.command(body), { application });
  assert.equal(calls[1].options.headers['X-Doji-CSRF'], validSession.csrf);
  assert.deepEqual(JSON.parse(calls[1].options.body), body);
  commandResponse = { application: null };
  await assert.rejects(client.command(body), /command response could not be verified/);
  assert.equal(client.hasSession(), true);
});
for (const status of [401, 403, 409, 500]) {
  test(`protected business error ${status} clears only revoked sessions`, async () => {
    const { client } = fixture((url) =>
      url.endsWith('/session') ? Response.json(validSession) : Response.json({}, { status }),
    );
    await client.restore();
    await assert.rejects(
      client.read(),
      (error) => error.status === status && (status !== 409 || error.code === 'PT409'),
    );
    assert.equal(client.hasSession(), ![401, 403].includes(status));
  });
}
test('late protected data after clear is rejected without clearing a newer session', async () => {
  const pending = deferred();
  const { client } = fixture((url) =>
    url.endsWith('/session') ? Response.json(validSession) : pending.promise,
  );
  await client.restore();
  const task = client.read();
  client.clear();
  await client.restore();
  pending.resolve(Response.json(application));
  await assert.rejects(task, /session has ended/);
  assert.equal(client.hasSession(), true);
});
test('stale unauthorized response cannot clear a newly restored business session', async () => {
  const pending = deferred();
  const { client } = fixture((url) =>
    url.endsWith('/session') ? Response.json(validSession) : pending.promise,
  );
  await client.restore();
  const task = client.read();
  client.clear();
  await client.restore();
  pending.resolve(Response.json({}, { status: 401 }));
  await assert.rejects(task, { status: 401 });
  assert.equal(client.hasSession(), true);
});
for (const invalid of [
  destination.replace('api.workos.com', 'evil.example.test'),
  destination.replace('/user_management/authorize', '/other'),
  destination.replace('https://', 'https://user@'),
  destination.replace('https://', 'https://user:password@'),
  destination + '#fragment',
  destination.replace('%2Fauth%2Fcallback', '%2Fwrong'),
])
  test(`sign-in rejects untrusted destination ${invalid}`, async () => {
    const { client } = fixture(() => Response.json({ authorizationUrl: invalid }));
    await assert.rejects(client.signin(), /destination could not be verified/);
  });
test('sign-in uses explicit intent and is fenced by clear', async () => {
  const pending = deferred();
  const { client, calls } = fixture(() => pending.promise);
  const task = client.signin({ signup: true });
  client.clear();
  pending.resolve(Response.json({ authorizationUrl: destination }));
  await assert.rejects(task, /sign-in is no longer active/);
  assert.deepEqual(JSON.parse(calls[0].options.body), { signup: true });
});
test('existing business session cannot start another sign-in', async () => {
  const { client, calls } = fixture();
  await client.restore();
  await assert.rejects(client.signin(), /Sign out before/);
  assert.equal(calls.length, 1);
});
for (const result of [
  { signedIn: false, remoteConfirmed: true },
  { signedIn: true },
  { signedIn: false, remoteConfirmed: false },
]) {
  test(`signout fences immediately and verifies provider confirmation ${JSON.stringify(result)}`, async () => {
    const pending = deferred();
    const { client, calls } = fixture((url) =>
      url.endsWith('/session') ? Response.json(validSession) : pending.promise,
    );
    await client.restore();
    const task = client.signout();
    assert.equal(client.hasSession(), false);
    pending.resolve(Response.json(result));
    if (result.remoteConfirmed === true) await task;
    else await assert.rejects(task, /Remote sign-out could not be confirmed/);
    assert.equal(calls[1].options.headers['X-Doji-CSRF'], validSession.csrf);
  });
}

const providerConfig = { clientId: 'client_test', apiKey: 'sk_' + 'synthetic'.repeat(5) };
const authResult = {
  user: { id: 'user_test', email_verified: true },
  access_token: 'synthetic-access',
  refresh_token: 'synthetic-refresh',
};
for (const patch of [{ clientId: '' }, { apiKey: '' }, { clientId: null }, { apiKey: null }])
  test(`business provider rejects config ${JSON.stringify(patch)}`, () =>
    assert.throws(() => createWorkosBusinessProvider({ ...providerConfig, ...patch })));
for (const signup of [true, false])
  test(`business authorization URL retains PKCE and signup=${signup}`, () => {
    const provider = createWorkosBusinessProvider(providerConfig);
    const url = new URL(
      provider.authorizationUrl({
        state: 'state',
        challenge: 'challenge',
        redirectUri: config.origin + '/auth/callback',
        signup,
      }),
    );
    assert.equal(url.origin, 'https://api.workos.com');
    assert.equal(url.searchParams.get('screen_hint'), signup ? 'sign-up' : 'sign-in');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('code_challenge'), 'challenge');
    assert.equal(url.searchParams.get('state'), 'state');
  });
for (const result of [
  { ...authResult, impersonator: {} },
  { ...authResult, user: null },
  { ...authResult, user: { ...authResult.user, email_verified: false } },
  { ...authResult, user: { ...authResult.user, id: 'not-subject' } },
  { ...authResult, access_token: null },
  { ...authResult, access_token: 'a'.repeat(8193) },
  { ...authResult, refresh_token: null },
  { ...authResult, refresh_token: 'a'.repeat(8193) },
])
  test(`provider rejects unverified or malformed tokens ${JSON.stringify(result).slice(0, 120)}`, async () => {
    const provider = createWorkosBusinessProvider(providerConfig, async () =>
      Response.json(result),
    );
    await assert.rejects(
      provider.exchange('code', 'verifier', AbortSignal.timeout(1000)),
      /Business authentication unavailable/,
    );
  });
test('provider refresh uses server-only credentials and returns only the expected token fields', async () => {
  let sent;
  const provider = createWorkosBusinessProvider(providerConfig, async (url, options) => {
    sent = { url, options };
    return Response.json(authResult);
  });
  assert.deepEqual(await provider.refresh('previous', AbortSignal.timeout(1000)), {
    subject: 'user_test',
    accessToken: 'synthetic-access',
    refreshToken: 'synthetic-refresh',
  });
  assert.equal(sent.url, 'https://api.workos.com/user_management/authenticate');
  assert.equal(sent.options.redirect, 'error');
  assert.deepEqual(JSON.parse(sent.options.body), {
    client_id: providerConfig.clientId,
    client_secret: providerConfig.apiKey,
    grant_type: 'refresh_token',
    refresh_token: 'previous',
  });
});
for (const response of [
  () => new Response(null, { status: 204 }),
  () => new Response('private details', { status: 503 }),
  () => new Response(''),
])
  test(`provider rejects unusable authentication body ${response().status}:${response().body === null}`, async () => {
    const provider = createWorkosBusinessProvider(providerConfig, async () => response());
    await assert.rejects(
      provider.exchange('code', 'verifier', AbortSignal.timeout(1000)),
      /Business authentication unavailable/,
    );
  });
test('provider revoke validates session IDs and accepts the documented empty 204', async () => {
  const calls = [];
  const provider = createWorkosBusinessProvider(providerConfig, async (...args) => {
    calls.push(args);
    return new Response(null, { status: 204 });
  });
  for (const id of [undefined, 'not-session'])
    await assert.rejects(provider.revoke(id, AbortSignal.timeout(1000)), /Invalid session/);
  assert.equal(calls.length, 0);
  await provider.revoke('session_test', AbortSignal.timeout(1000));
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0][1].body), { session_id: 'session_test' });
});
