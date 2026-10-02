// All HTTP/provider calls stubbed. No token from a real key; no network.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Rest } from 'ably';
import {
  businessRealtimeToken,
  BUSINESS_TOKEN_TTL,
  assertBusinessEvent,
} from '../supabase/functions/_shared/business-realtime.ts';
import {
  createBusinessRealtime,
  validBusinessMessage,
} from '../website/business-portal/business-realtime.js';
import {
  createBusinessApplicationClient,
  createApplicationController,
} from '../website/business-portal/application-client.js';
const id = '78000000-0000-4000-8000-000000000001',
  other = '78000000-0000-4000-8000-000000000002';
const topic = `business:${id}:events`,
  app = '78000000-0000-4000-8000-000000000003';
const env = {
  enabled: true,
  origin: 'https://business.example.test',
  supabaseUrl: 'https://auth.example.test',
  anonKey: 'public-test',
};
let count = 0;
async function test(name, fn) {
  await fn();
  count++;
  console.log(`PASS: ${name}`);
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
async function request({
  body = {},
  method = 'POST',
  origin = env.origin,
  bearer = 'Bearer caller',
  config = {},
  data = { allowed: true, userId: id, topic },
  code = 200,
  signError = false,
} = {}) {
  const calls = [],
    signs = [];
  const response = await businessRealtimeToken(
    new Request(`${env.supabaseUrl}/functions/v1/business-realtime-token`, {
      method,
      headers: { origin, authorization: bearer, 'content-type': 'application/json' },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    }),
    { ...env, ...config },
    async (params) => {
      signs.push(params);
      if (signError) throw Error('secret provider detail');
      return { test: true, ...params };
    },
    async (url, init) => {
      calls.push({ url, init });
      return Response.json(data, { status: code });
    },
  );
  return { response, calls, signs };
}
await test('caller authorization exact subscribe-only own topic, ten-minute TTL', async () => {
  const { response, calls, signs } = await request();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(calls[0].init.headers.authorization, 'Bearer caller');
  assert.equal(calls[0].init.headers.apikey, 'public-test');
  assert.equal(calls[0].init.body, '{}');
  assert.ok(calls[0].init.signal);
  assert.deepEqual(signs, [
    {
      clientId: `business:${id}`,
      ttl: BUSINESS_TOKEN_TTL,
      capability: JSON.stringify({ [topic]: ['subscribe'] }),
    },
  ]);
  assert.equal(BUSINESS_TOKEN_TTL, 600000);
});
for (const [name, options, status] of [
  ['disabled', { config: { enabled: false } }, 404],
  ['wrong origin', { origin: 'https://evil.test' }, 403],
  ['missing bearer', { bearer: '' }, 401],
  ['GET', { method: 'GET' }, 405],
  ['account injection', { body: { userId: other } }, 400],
  ['publish injection', { body: { capability: { '*': ['publish'] } } }, 400],
  ['oversized', { body: { padding: 'x'.repeat(300) } }, 400],
  ['array', { body: [] }, 400],
  ['invalid origin config', { config: { origin: 'http://business.example.test' } }, 503],
])
  await test(`${name} denied before database/provider`, async () => {
    const r = await request(options);
    assert.equal(r.response.status, status);
    assert.equal(r.calls.length, 0);
    assert.equal(r.signs.length, 0);
  });
for (const [name, options, status] of [
  [
    'cross-account topic',
    { data: { allowed: true, userId: id, topic: `business:${other}:events` } },
    503,
  ],
  ['wildcard identity', { data: { allowed: true, userId: '*', topic: 'business:*:events' } }, 503],
  ['revoked', { code: 403, data: {} }, 403],
  ['budget exhausted', { data: { allowed: false } }, 429],
  ['missing authorization result', { data: {} }, 503],
  ['database error', { code: 500, data: {} }, 503],
])
  await test(name, async () => {
    const r = await request(options);
    assert.equal(r.response.status, status);
    assert.equal(r.signs.length, 0);
  });
await test('provider failure never leaks body', async () => {
  const r = await request({ signError: true });
  assert.equal(r.response.status, 503);
  assert.ok(!(await r.response.text()).includes('secret'));
});
const event = {
  topic,
  event_type: 'business.application.updated',
  aggregate_id: app,
  payload: { applicationId: app, applicantId: id, sendPush: false },
};
await test('valid applicant and staff events; default off', () => {
  assert.doesNotThrow(() => assertBusinessEvent(event, true));
  assert.throws(() => assertBusinessEvent(event, false));
  assert.doesNotThrow(() =>
    assertBusinessEvent(
      {
        ...event,
        topic: 'moderation:global',
        event_type: 'moderation.business.updated',
        payload: { applicationId: app, sendPush: false },
      },
      true,
    ),
  );
});
for (const [name, change] of [
  ['cross-account', { topic: `business:${other}:events` }],
  ['member topic', { topic: `user:${id}:events` }],
  ['member event', { event_type: 'doji.activated' }],
  ['push', { payload: { ...event.payload, sendPush: true } }],
  ['PII', { payload: { ...event.payload, email: 'private@example.test' } }],
  ['wrong aggregate', { aggregate_id: other }],
  ['unknown family', { event_type: 'business.unknown' }],
  ['missing applicant', { payload: { applicationId: app, sendPush: false } }],
])
  await test(`relay rejects ${name}`, () =>
    assert.throws(() => assertBusinessEvent({ ...event, ...change }, true)));
await test('member event families pass through unchanged when disabled', () =>
  assert.doesNotThrow(() =>
    assertBusinessEvent(
      {
        topic: 'doji:global',
        event_type: 'doji.activated',
        aggregate_id: app,
        payload: { sendPush: true },
      },
      false,
    ),
  ));
const message = {
  name: event.event_type,
  data: { ...event.payload, aggregateId: app, eventId: other, occurredAt: '2026-09-29T00:00:00Z' },
};
await test('consumer strict envelope rejects wrong target, details and malformed ID', () => {
  assert.ok(validBusinessMessage(message, topic));
  for (const patch of [
    { applicantId: other },
    { details: {} },
    { eventId: 'invalid' },
    { sendPush: true },
  ])
    assert.ok(!validBusinessMessage({ ...message, data: { ...message.data, ...patch } }, topic));
});
function harness({ enabled = true, gate } = {}) {
  let clearListener,
    epoch = 0,
    connected = false,
    reads = 0,
    tokens = 0,
    options,
    connectionListener,
    channelListener,
    hint,
    closed = 0;
  const channel = {
    on: (fn) => (channelListener = fn),
    off: () => {},
    subscribe: async (name, fn) => {
      hint = fn;
    },
    unsubscribe: () => {},
  };
  const client = {
    hasSession: () => true,
    epoch: () => epoch,
    onClear: (fn) => {
      clearListener = fn;
      return () => {};
    },
    realtimeToken: async () => {
      tokens++;
      if (gate) await gate.promise;
      return { topic, tokenRequest: { clientId: `business:${id}` } };
    },
  };
  const transport = createBusinessRealtime({
    client,
    enabled,
    loadSdk: async () => ({
      Realtime: class {
        constructor(o) {
          options = o;
        }
        connection = { on: (fn) => (connectionListener = fn), off: () => {} };
        channels = {
          get: (t) => {
            assert.equal(t, topic);
            return channel;
          },
        };
        connect() {
          connected = true;
        }
        close() {
          closed++;
        }
      },
    }),
    reconcile: () => reads++,
  });
  return {
    transport,
    clear: () => {
      epoch++;
      clearListener();
    },
    snapshot: () => ({ reads, tokens, connected, closed }),
    hint: (m) => hint(m),
    connection: (c) => connectionListener(c),
    channel: (c) => channelListener(c),
    auth: () =>
      new Promise((resolve) =>
        options.authCallback({}, (error, token) => resolve({ error, token })),
      ),
  };
}
await test('default off creates no token or connection', async () => {
  const h = harness({ enabled: false });
  await h.transport.start();
  assert.deepEqual(h.snapshot(), { reads: 0, tokens: 0, connected: false, closed: 0 });
});
await test('reconnect, discontinuity and bounded duplicate hints reconcile reads', async () => {
  const h = harness();
  await h.transport.start();
  const baseline = h.snapshot().reads;
  h.hint(message);
  h.hint(message);
  assert.equal(h.snapshot().reads, baseline + 1);
  h.hint({ ...message, data: { ...message.data, applicantId: other } });
  assert.equal(h.snapshot().reads, baseline + 1);
  h.connection({ current: 'connected' });
  h.channel({ current: 'attached', resumed: false });
  assert.equal(h.snapshot().reads, baseline + 3);
  h.channel({ current: 'attached', resumed: true });
  assert.equal(h.snapshot().reads, baseline + 3);
  h.transport.destroy();
});
await test('logout closes socket and ignores late hints/auth callback', async () => {
  const h = harness();
  await h.transport.start();
  h.clear();
  const baseline = h.snapshot().reads;
  h.hint(message);
  h.connection({ current: 'connected' });
  assert.equal(h.snapshot().reads, baseline);
  assert.equal(h.snapshot().closed, 1);
  assert.ok((await h.auth()).error);
});
await test('late initial token cannot open socket after logout', async () => {
  const gate = deferred(),
    h = harness({ gate });
  const pending = h.transport.start();
  h.clear();
  gate.resolve();
  await pending;
  assert.equal(h.snapshot().connected, false);
});
await test('token renewal uses endpoint again, no user-selected capabilities', async () => {
  const h = harness();
  await h.transport.start();
  assert.ok((await h.auth()).token);
  assert.equal(h.snapshot().tokens, 1);
  assert.ok((await h.auth()).token);
  assert.equal(h.snapshot().tokens, 2);
  h.transport.destroy();
});
await test('coalesced read gets a trailing read and preserves dirty draft', async () => {
  let n = 0;
  const gate = deferred();
  const c = createApplicationController({
    epoch: () => 0,
    onClear: () => () => {},
    read: async () => {
      n++;
      if (n === 2) await gate.promise;
      return { revision: n, details: { brand_name: `server ${n}` } };
    },
  });
  await c.load();
  c.edit('brand_name', 'unsaved');
  const pending = c.load();
  c.reconcile();
  c.reconcile();
  gate.resolve();
  await pending;
  await tick();
  assert.equal(n, 3);
  assert.equal(c.snapshot().draft.brand_name, 'unsaved');
  assert.equal(c.snapshot().stale, true);
  c.destroy();
});
await test('reconcile during command waits until command completes', async () => {
  let n = 0;
  const gate = deferred();
  const c = createApplicationController({
    epoch: () => 0,
    onClear: () => () => {},
    read: async () => {
      n++;
      return { revision: 2, details: {} };
    },
    command: async () => {
      await gate.promise;
      return { application: { revision: 2, details: {} } };
    },
  });
  await c.load();
  const pending = c.command('save');
  c.reconcile();
  c.reconcile();
  assert.equal(n, 1);
  gate.resolve();
  await pending;
  await tick();
  assert.equal(n, 2);
  c.destroy();
});
await test('client token response checks exact session, refuses late result', async () => {
  const gate = deferred();
  const c = createBusinessApplicationClient(
    { ...env, enabled: true, realtimeEnabled: true },
    async (url) => {
      if (url.endsWith('business-auth'))
        return Response.json({
          user: {
            id,
            role: 'doji_business',
            app_metadata: { account_type: 'business' },
            email_confirmed_at: '2026-09-29',
          },
          access_token: 'test',
          refresh_token: 'refresh',
          expires_in: 3600,
        });
      await gate.promise;
      return Response.json({ topic, tokenRequest: { clientId: `business:${id}` } });
    },
  );
  await c.signin({});
  const pending = c.realtimeToken();
  await tick();
  c.clear();
  gate.resolve();
  await assert.rejects(pending, /session has ended/);
});
await test('installed Ably SDK signs only the exact capability with synthetic key, offline', async () => {
  const secret = 'synthetic-business-realtime-secret';
  const provider = new Rest({ key: `synthetic.key:${secret}`, queryTime: false });
  const token = await provider.auth.createTokenRequest({
    clientId: `business:${id}`,
    ttl: BUSINESS_TOKEN_TTL,
    capability: JSON.stringify({ [topic]: ['subscribe'] }),
    timestamp: Date.now(),
  });
  assert.deepEqual(JSON.parse(token.capability), { [topic]: ['subscribe'] });
  const text = [
    token.keyName,
    token.ttl,
    token.capability,
    token.clientId,
    token.timestamp,
    token.nonce,
    '',
  ].join('\n');
  assert.equal(token.mac, createHmac('sha256', secret).update(text).digest('base64'));
  assert.ok(!JSON.stringify(token).includes(secret));
});
console.log(`${count} business realtime contracts passed; no external traffic.`);
