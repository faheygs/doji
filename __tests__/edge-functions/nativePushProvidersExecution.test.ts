import { webcrypto } from 'node:crypto';
import type * as Apns from '../../supabase/functions/_shared/apns-push';
import type * as Fcm from '../../supabase/functions/_shared/fcm-push';

let apns: typeof Apns;
let fcm: typeof Fcm;
let settings: Record<string, string | undefined>;
let ec: CryptoKeyPair;
let rsa: CryptoKeyPair;
let ecPem: string;
let rsaPem: string;
const transport = jest.fn();
const originalFetch = global.fetch;
const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
const denoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Deno');
beforeAll(async () => {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
  ec = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  rsa = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const pem = async (key: CryptoKey) =>
    `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey('pkcs8', key)).toString('base64')}\n-----END PRIVATE KEY-----`;
  ecPem = await pem(ec.privateKey);
  rsaPem = await pem(rsa.privateKey);
});
beforeEach(() => {
  settings = {
    APNS_KEY_ID: 'synthetic-key',
    APNS_TEAM_ID: 'synthetic-team',
    APNS_PRIVATE_KEY: ecPem,
    APNS_BUNDLE_ID: 'com.synthetic.test',
    FCM_PROJECT_ID: 'synthetic-project',
    FCM_CLIENT_EMAIL: 'synthetic@synthetic-project.iam.gserviceaccount.com',
    FCM_PRIVATE_KEY: rsaPem,
  };
  Object.defineProperty(globalThis, 'Deno', {
    configurable: true,
    value: { env: { get: (key: string) => settings[key] } },
  });
  global.fetch = transport;
  transport
    .mockReset()
    .mockImplementation(async (url: string) =>
      url.includes('oauth2')
        ? Response.json({ access_token: 'synthetic-oauth', expires_in: 3600 })
        : url.includes('fcm.googleapis')
          ? Response.json({ name: 'synthetic-ticket' })
          : new Response(null, { headers: { 'apns-id': 'synthetic-ticket' } }),
    );
  jest.isolateModules(() => {
    apns = require('../../supabase/functions/_shared/apns-push');
    fcm = require('../../supabase/functions/_shared/fcm-push');
  });
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
  jest.useRealTimers();
});
afterAll(() => {
  for (const [key, descriptor] of [
    ['crypto', cryptoDescriptor],
    ['Deno', denoDescriptor],
  ] as const) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});
const apnsMessage: Apns.ApnsMessage = {
  token: 'synthetic/token',
  environment: 'production',
  title: 'Synthetic',
  body: 'Local-only test',
  collapseId: 'event:synthetic',
  expiresAtEpochSeconds: 1800000000,
  data: { eventId: 'synthetic-event' },
};
const fcmMessage: Fcm.FcmMessage = {
  token: 'synthetic-token',
  title: 'Synthetic',
  body: 'Local-only test',
  collapseKey: 'event:synthetic',
  ttlSeconds: 0,
  data: { eventId: 'synthetic-event' },
  channelId: 'doji-live',
};
const database = () => ({
  rpc: jest.fn().mockResolvedValue({
    data: {
      state: 'ready',
      provider_token: 'canonical-synthetic',
      issued_at: new Date().toISOString(),
    },
    error: null,
  }),
});

test.each(['APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_PRIVATE_KEY', 'APNS_BUNDLE_ID'])(
  'APNs configuration requires %s',
  (key) => {
    expect(apns.apnsConfigured()).toBe(true);
    settings[key] = undefined;
    expect(apns.apnsConfigured()).toBe(false);
  },
);
test.each(['production', 'sandbox'] as const)(
  'APNs uses the exact %s host, bounded request and expiration contract',
  async (environment) => {
    const db = database();
    const result = await apns.sendApnsMessage(db, {
      ...apnsMessage,
      environment,
      interruptionLevel: environment === 'sandbox' ? 'time-sensitive' : undefined,
    });
    expect(result).toEqual({ outcome: 'accepted', providerId: 'synthetic-ticket' });
    const [url, init] = transport.mock.calls[0];
    expect(url).toBe(
      `https://api.${environment === 'sandbox' ? 'sandbox.' : ''}push.apple.com/3/device/synthetic%2Ftoken`,
    );
    expect(init.headers).toMatchObject({
      authorization: 'bearer canonical-synthetic',
      'apns-topic': 'com.synthetic.test',
      'apns-expiration': '1800000000',
      'apns-collapse-id': 'event:synthetic',
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body)).toMatchObject({
      aps: {
        alert: { title: 'Synthetic', body: 'Local-only test' },
        'interruption-level': environment === 'sandbox' ? 'time-sensitive' : 'active',
      },
      eventId: 'synthetic-event',
    });
    await apns.sendApnsMessage(db, apnsMessage);
    expect(db.rpc).toHaveBeenCalledTimes(1);
  },
);
test('concurrent APNs sends share one durable token claim', async () => {
  const db = database();
  await Promise.all([apns.sendApnsMessage(db, apnsMessage), apns.sendApnsMessage(db, apnsMessage)]);
  expect(db.rpc).toHaveBeenCalledTimes(1);
  expect(transport).toHaveBeenCalledTimes(2);
});
test('expired local APNs cache rechecks the shared provider credential', async () => {
  const db = database();
  await apns.sendApnsMessage(db, apnsMessage);
  jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 45 * 60_000);
  await apns.sendApnsMessage(db, apnsMessage);
  expect(db.rpc).toHaveBeenCalledTimes(2);
});
test('APNs refresh mints a verifiable ES256 token only after acquiring its lease', async () => {
  settings.APNS_PRIVATE_KEY = ecPem.replaceAll('\n', '\\n');
  const db = database();
  db.rpc
    .mockResolvedValueOnce({ data: { state: 'refresh', lease_id: 'lease' }, error: null })
    .mockResolvedValueOnce({ data: true, error: null });
  expect((await apns.sendApnsMessage(db, apnsMessage)).outcome).toBe('accepted');
  expect(db.rpc.mock.calls[1][0]).toBe('store_apns_provider_token');
  const args = db.rpc.mock.calls[1][1];
  const [header, payload, signature] = args.p_provider_token.split('.');
  expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
    alg: 'ES256',
    kid: 'synthetic-key',
  });
  expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toMatchObject({
    iss: 'synthetic-team',
    iat: expect.any(Number),
  });
  expect(
    await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      ec.publicKey,
      Buffer.from(signature, 'base64url'),
      new TextEncoder().encode(`${header}.${payload}`),
    ),
  ).toBe(true);
  expect(args.p_lease_id).toBe('lease');
});
test.each(['claim', 'publication', 'missing key', 'missing team', 'missing private key'])(
  'APNs %s failure prevents provider delivery',
  async (failure) => {
    const db = database();
    if (failure === 'claim')
      db.rpc.mockResolvedValue({ error: { message: 'claim failed' }, data: null });
    else if (failure === 'publication')
      db.rpc
        .mockResolvedValueOnce({ data: { state: 'refresh', lease_id: 'lease' }, error: null })
        .mockResolvedValueOnce({ error: { message: 'publish failed' } });
    else {
      settings[
        failure === 'missing key'
          ? 'APNS_KEY_ID'
          : failure === 'missing team'
            ? 'APNS_TEAM_ID'
            : 'APNS_PRIVATE_KEY'
      ] = undefined;
      db.rpc.mockResolvedValue({ data: { state: 'refresh', lease_id: 'lease' }, error: null });
    }
    expect((await apns.sendApnsMessage(db, apnsMessage)).outcome).toBe('transport_error');
    expect(transport).not.toHaveBeenCalled();
  },
);
test.each([
  null,
  { state: 'ready', provider_token: 'token', issued_at: 'invalid' },
  { state: 'ready', provider_token: 'token', issued_at: null },
  { state: 'wait', retry_after_ms: 0 },
  { state: 'wait', retry_after_ms: 500 },
])('APNs coordination waits are bounded to ten attempts (%j)', async (claim) => {
  jest.useFakeTimers();
  const db = database();
  db.rpc.mockResolvedValue({ data: claim, error: null });
  const pending = apns.sendApnsMessage(db, apnsMessage);
  await jest.advanceTimersByTimeAsync(2000);
  expect(await pending).toMatchObject({
    outcome: 'transport_error',
    error: expect.stringContaining('coordination deadline'),
  });
  expect(db.rpc).toHaveBeenCalledTimes(10);
  expect(transport).not.toHaveBeenCalled();
});
test('rejected APNs lease publication reclaims instead of sending an uncoordinated token', async () => {
  const db = database();
  db.rpc
    .mockResolvedValueOnce({ data: { state: 'refresh', lease_id: 'old' }, error: null })
    .mockResolvedValueOnce({ data: false, error: null });
  expect((await apns.sendApnsMessage(db, apnsMessage)).outcome).toBe('accepted');
  expect(db.rpc).toHaveBeenCalledTimes(3);
  expect(transport.mock.calls[0][1].headers.authorization).toBe('bearer canonical-synthetic');
});
test.each(['same', 'changed'])(
  'APNs concrete credential rejection retries only a %s canonical credential',
  async (token) => {
    const db = database();
    if (token === 'changed')
      db.rpc.mockResolvedValueOnce({
        data: { state: 'ready', provider_token: 'old', issued_at: new Date().toISOString() },
        error: null,
      });
    transport.mockResolvedValueOnce(
      new Response('{"reason":"ExpiredProviderToken"}', { status: 403 }),
    );
    const result = await apns.sendApnsMessage(db, apnsMessage);
    expect(result.outcome).toBe(token === 'changed' ? 'accepted' : 'rejected');
    expect(transport).toHaveBeenCalledTimes(token === 'changed' ? 2 : 1);
    expect(db.rpc).toHaveBeenCalledTimes(2);
  },
);
test.each([
  [410, 'Gone', 'invalid_token'],
  [400, 'BadDeviceToken', 'invalid_token'],
  [400, 'Unregistered', 'invalid_token'],
  [400, 'DeviceTokenNotForTopic', 'invalid_token'],
  [500, 'Unavailable', 'rejected'],
] as const)('APNs %i/%s classifies without an ambiguous resend', async (status, body, outcome) => {
  transport.mockResolvedValue(new Response(body, { status }));
  expect(await apns.sendApnsMessage(database(), apnsMessage)).toMatchObject({
    outcome,
    error: `APNs ${status}: ${body}`,
  });
  expect(transport).toHaveBeenCalledTimes(1);
});
test.each([new Error('network'), 'plain transport failure'])(
  'APNs ambiguous transport failures are not retried (%j)',
  async (failure) => {
    transport.mockRejectedValue(failure);
    expect(await apns.sendApnsMessage(database(), apnsMessage)).toMatchObject({
      outcome: 'transport_error',
      error: failure instanceof Error ? failure.message : failure,
    });
    expect(transport).toHaveBeenCalledTimes(1);
  },
);

test.each([
  ['FCM_PROJECT_ID', undefined, 'credentials are not configured'],
  ['FCM_CLIENT_EMAIL', undefined, 'credentials are not configured'],
  ['FCM_PRIVATE_KEY', undefined, 'credentials are not configured'],
  ['FCM_PROJECT_ID', 'https://secret.invalid', 'project ID is malformed'],
  ['FCM_CLIENT_EMAIL', 'not-an-account', 'client email is malformed'],
  ['FCM_PRIVATE_KEY', 'invalid', 'private key is malformed'],
])('FCM configuration rejects %s=%s before transport', async (key, value, error) => {
  settings[key!] = value;
  expect(fcm.fcmConfigured()).toBe(false);
  expect(await fcm.sendFcmMessage(fcmMessage)).toEqual({
    outcome: 'transport_error',
    error: `FCM ${error}`,
  });
  expect(transport).not.toHaveBeenCalled();
});
test('FCM signs real RS256 OAuth claims, bounds TTL, reuses credentials and keeps provider data exact', async () => {
  expect(fcm.fcmConfigured()).toBe(true);
  settings.FCM_PRIVATE_KEY = rsaPem.replaceAll('\n', '\\n');
  expect(await fcm.sendFcmMessage(fcmMessage)).toEqual({
    outcome: 'accepted',
    providerId: 'synthetic-ticket',
  });
  const oauth = transport.mock.calls[0];
  const assertion = oauth[1].body.get('assertion');
  const [header, payload, signature] = assertion.split('.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  expect(claims).toMatchObject({
    iss: settings.FCM_CLIENT_EMAIL,
    aud: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  });
  expect(claims.exp - claims.iat).toBe(3600);
  expect(
    await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      rsa.publicKey,
      Buffer.from(signature, 'base64url'),
      new TextEncoder().encode(`${header}.${payload}`),
    ),
  ).toBe(true);
  const push = transport.mock.calls[1];
  expect(push[0]).toBe('https://fcm.googleapis.com/v1/projects/synthetic-project/messages:send');
  expect(push[1].signal).toBeInstanceOf(AbortSignal);
  expect(push[1].headers.authorization).toBe('Bearer synthetic-oauth');
  expect(JSON.parse(push[1].body).message).toMatchObject({
    token: fcmMessage.token,
    android: {
      ttl: '1s',
      collapse_key: fcmMessage.collapseKey,
      priority: 'HIGH',
      notification: { channel_id: 'doji-live' },
    },
  });
  await fcm.sendFcmMessage({ ...fcmMessage, ttlSeconds: 60 });
  expect(transport.mock.calls.filter(([url]) => url.includes('oauth2'))).toHaveLength(1);
});
test.each([undefined, 1])(
  'FCM caches a bounded OAuth lifetime (expires_in=%s)',
  async (expires_in) => {
    transport.mockResolvedValueOnce(Response.json({ access_token: 'short', expires_in }));
    await fcm.sendFcmMessage(fcmMessage);
    if (expires_in === undefined) jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 3480_001);
    await fcm.sendFcmMessage(fcmMessage);
    expect(transport.mock.calls.filter(([url]) => url.includes('oauth2'))).toHaveLength(2);
  },
);
test.each([{ error: 'invalid_grant' }, { error: 'private\nurl/secret' }, {}])(
  'OAuth rejection never exposes provider error payloads (%j)',
  async (payload) => {
    transport.mockResolvedValue(Response.json(payload, { status: 400 }));
    expect(await fcm.sendFcmMessage(fcmMessage)).toEqual({
      outcome: 'transport_error',
      error: 'FCM transport failed (Error)',
    });
    expect(transport).toHaveBeenCalledTimes(1);
  },
);
test.each([
  ['UNREGISTERED', 'invalid_token'],
  ['SENDER_ID_MISMATCH', 'invalid_token'],
  ['QUOTA_EXCEEDED', 'rejected'],
  [undefined, 'rejected'],
] as const)(
  'FCM provider error %s retains only safe classification',
  async (errorCode, outcome) => {
    transport.mockImplementation(async (url: string) =>
      url.includes('oauth2')
        ? Response.json({ access_token: 'token' })
        : Response.json(
            {
              error: {
                message: 'private provider details',
                details: [{}, ...(errorCode ? [{ errorCode }] : [])],
              },
            },
            { status: 400 },
          ),
    );
    const result = await fcm.sendFcmMessage(fcmMessage);
    expect(result).toEqual({
      outcome,
      error: `FCM 400: ${errorCode ?? 'provider rejected request'}`,
    });
    expect(JSON.stringify(result)).not.toContain('private provider details');
  },
);
test('missing FCM error object remains a bounded provider rejection', async () => {
  transport
    .mockResolvedValueOnce(Response.json({ access_token: 'token' }))
    .mockResolvedValueOnce(Response.json({}, { status: 503 }));
  expect(await fcm.sendFcmMessage(fcmMessage)).toEqual({
    outcome: 'rejected',
    error: 'FCM 503: provider rejected request',
  });
});
test.each([
  new Error('private provider details'),
  'private provider details',
  Object.assign(new Error('private'), { name: '' }),
])('FCM transport errors never leak sensitive underlying messages (%j)', async (failure) => {
  transport.mockRejectedValue(failure);
  const result = await fcm.sendFcmMessage(fcmMessage);
  expect(result.outcome).toBe('transport_error');
  expect(result.error).toBe(
    failure instanceof Error ? 'FCM transport failed (Error)' : 'FCM transport failed',
  );
});
