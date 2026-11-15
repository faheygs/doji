import { createHash, webcrypto } from 'node:crypto';
import { stagingPushPolicy } from '../../supabase/functions/_shared/staging-push-egress';
import { stagingFetch } from '../../supabase/functions/_shared/staging-egress';

const apnsToken = 'a'.repeat(64);
const fcmToken = 'synthetic-device-token';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const devices = { apns: [hash(apnsToken)], fcm: [hash(fcmToken)] };
const environment: Record<string, string> = {
  STAGING_PUSH_ENABLED: 'true',
  DOJI_ENVIRONMENT: 'staging',
  SUPABASE_URL: 'https://ohrcupagdoilkwhecict.supabase.co',
  APNS_BUNDLE_ID: 'com.doit.challengeapp.staging',
  APNS_TEAM_ID: 'HUG35JPQGG',
  APNS_KEY_ID: 'SYNTHETIC1',
  FCM_PROJECT_ID: 'doji-staging',
  FCM_CLIENT_EMAIL: 'doji-staging-push@doji-staging.iam.gserviceaccount.com',
  STAGING_PUSH_DEVICE_HASHES: JSON.stringify(devices),
};
const policy = (overrides: Record<string, string | undefined> = {}) => {
  const values = { ...environment, ...overrides };
  return stagingPushPolicy((name) => values[name]);
};
const now = () => Math.floor(Date.now() / 1000);
const jwt = (header: object, claims: object) =>
  [header, claims, 'synthetic-signature']
    .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
    .join('.');
const oauth = 'https://oauth2.googleapis.com/token';
const oauthClaims = () => ({
  iss: environment.FCM_CLIENT_EMAIL,
  aud: oauth,
  scope: 'https://www.googleapis.com/auth/firebase.messaging',
  iat: now(),
  exp: now() + 3600,
});
const oauthRequest = (claims = {}, header = {}, fields = {}) =>
  new Request(oauth, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt({ alg: 'RS256', ...header }, { ...oauthClaims(), ...claims }),
      ...fields,
    }),
  });
const apnsRequest = (
  headers = {},
  token = apnsToken,
  body: unknown = { aps: { alert: { title: 'Synthetic' } } },
) =>
  new Request(`https://api.push.apple.com/3/device/${token}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'apns-topic': environment.APNS_BUNDLE_ID,
      'apns-push-type': 'alert',
      'apns-expiration': String(now() + 120),
      authorization: `bearer ${jwt({ alg: 'ES256', kid: environment.APNS_KEY_ID }, { iss: environment.APNS_TEAM_ID, iat: now() })}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
const message = () => ({
  token: fcmToken,
  notification: { title: 'Synthetic' },
  data: {},
  android: { ttl: '300s' },
});
const fcmRequest = (changes = {}, headers = {}, body?: unknown) =>
  new Request('https://fcm.googleapis.com/v1/projects/doji-staging/messages:send', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer synthetic',
      ...headers,
    },
    body: JSON.stringify(body ?? { message: { ...message(), ...changes } }),
  });
const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
beforeAll(() =>
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto }),
);
afterAll(() => {
  if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
});

test('absent or false gate grants no provider access', () => {
  for (const value of [undefined, 'false', 'TRUE', '1'])
    expect(policy({ STAGING_PUSH_ENABLED: value })).toBeUndefined();
});
test.each([
  ['DOJI_ENVIRONMENT', 'production'],
  ['SUPABASE_URL', 'https://tvixsmqxotuvyjqzmjla.supabase.co'],
  ['APNS_BUNDLE_ID', 'com.doit.challengeapp'],
  ['APNS_TEAM_ID', 'OTHERTEAM1'],
  ['APNS_KEY_ID', 'bad'],
  ['APNS_KEY_ID', undefined],
  ['FCM_PROJECT_ID', 'production'],
  ['FCM_CLIENT_EMAIL', 'other@doji-staging.iam.gserviceaccount.com'],
])('rejects mixed binding %s before provider I/O', (key, value) => {
  expect(() => policy({ [key!]: value })).toThrow('bindings rejected');
});
test.each([
  undefined,
  '',
  'null',
  '[]',
  '{',
  'x'.repeat(2049),
  JSON.stringify({ ...devices, extra: [] }),
  JSON.stringify({ apns: [], fcm: [] }),
  JSON.stringify({ apns: ['bad'], fcm: [] }),
  JSON.stringify({ apns: Array(6).fill(hash(apnsToken)), fcm: [] }),
  JSON.stringify({ apns: {}, fcm: [] }),
  JSON.stringify({ apns: [], fcm: [1] }),
])('rejects invalid or unbounded device configuration', (value) => {
  expect(() => policy({ STAGING_PUSH_DEVICE_HASHES: value })).toThrow();
});
test('allows only the configured device hashes and exact provider exchange', async () => {
  const authorize = policy()!;
  for (const request of [oauthRequest(), apnsRequest(), fcmRequest()])
    expect(await authorize(request)).toBe(true);
  expect(await authorize(apnsRequest({}, 'b'.repeat(64)))).toBe(false);
  for (const token of [undefined, '', 'short', 'x'.repeat(4097), 'other-synthetic-device'])
    expect(await authorize(fcmRequest({ token }))).toBe(false);
});
test.each([
  { iss: 'production@production.iam.gserviceaccount.com' },
  { aud: 'https://example.test' },
  { scope: 'https://www.googleapis.com/auth/cloud-platform' },
  { iat: 0 },
  { exp: 0 },
  { iat: 'not-numeric' },
  { exp: 'not-numeric' },
])('denies OAuth identity, scope or lifetime mismatch', async (claims) => {
  expect(await policy()!(oauthRequest(claims))).toBe(false);
});
test('denies future/overlong OAuth, wrong algorithm, duplicate fields and APNs-only exchanges', async () => {
  const authorize = policy()!;
  for (const request of [
    oauthRequest({ iat: now() + 61 }),
    oauthRequest({ exp: now() + 3601 }),
    oauthRequest({}, { alg: 'none' }),
    oauthRequest({}, {}, { grant_type: 'invalid' }),
    oauthRequest({}, {}, { extra: 'invalid' }),
  ])
    expect(await authorize(request)).toBe(false);
  const duplicate = oauthRequest();
  expect(
    await authorize(
      new Request(duplicate, { body: `${await duplicate.text()}&assertion=duplicate` }),
    ),
  ).toBe(false);
  expect(
    await policy({ STAGING_PUSH_DEVICE_HASHES: JSON.stringify({ apns: devices.apns, fcm: [] }) })!(
      oauthRequest(),
    ),
  ).toBe(false);
});
test.each([
  { 'apns-topic': 'com.doit.challengeapp' },
  { 'apns-push-type': 'background' },
  { authorization: 'Bearer synthetic' },
  { 'apns-expiration': '0' },
  { 'apns-expiration': 'NaN' },
  { 'content-type': 'text/plain' },
])('denies APNs header mismatch', async (headers) => {
  expect(await policy()!(apnsRequest(headers))).toBe(false);
});
test('denies overlong APNs TTL, other signing identity and missing alert', async () => {
  const authorize = policy()!;
  expect(await authorize(apnsRequest({ 'apns-expiration': String(now() + 301) }))).toBe(false);
  for (const [header, claims] of [
    [{ alg: 'none', kid: environment.APNS_KEY_ID }, { iss: environment.APNS_TEAM_ID }],
    [{ alg: 'ES256', kid: 'OTHERKEY12' }, { iss: environment.APNS_TEAM_ID }],
    [{ alg: 'ES256', kid: environment.APNS_KEY_ID }, { iss: 'OTHERTEAM1' }],
  ])
    expect(await authorize(apnsRequest({ authorization: `bearer ${jwt(header, claims)}` }))).toBe(
      false,
    );
  expect(await authorize(apnsRequest({}, apnsToken, { aps: {} }))).toBe(false);
});
test.each([
  { topic: 'all' },
  { condition: 'all' },
  { android: { ttl: '301s' } },
  { android: { ttl: '0s' } },
  { android: { ttl: 300 } },
])('denies FCM multicast or excessive lifetime', async (changes) => {
  expect(await policy()!(fcmRequest(changes))).toBe(false);
});
test('denies FCM missing bearer, invalid envelope, and wrong content type', async () => {
  const authorize = policy()!;
  expect(await authorize(fcmRequest({}, { authorization: '' }))).toBe(false);
  expect(await authorize(fcmRequest({}, { 'content-type': 'text/plain' }))).toBe(false);
  expect(await authorize(fcmRequest({}, {}, {}))).toBe(false);
  expect(await authorize(fcmRequest({}, {}, { message: message(), extra: true }))).toBe(false);
});
test.each([
  'https://api.sandbox.push.apple.com/3/device/' + apnsToken,
  'https://api.push.apple.com:444/3/device/' + apnsToken,
  'https://api.push.apple.com/3/device/' + apnsToken + '?x=1',
  'https://api.push.apple.com/3/device/' + apnsToken + '#fragment',
  'https://fcm.googleapis.com/v1/projects/production/messages:send',
  'https://exp.host/--/api/v2/push/send',
])('denies unapproved provider URL %s', async (url) => {
  expect(await policy()!(new Request(url, apnsRequest()))).toBe(false);
});
test('GET cannot use the provider grant', async () => {
  expect(await policy()!(new Request(oauth))).toBe(false);
});
test('malformed and oversized requests expose only a generic error', async () => {
  const authorize = policy()!;
  for (const request of [
    apnsRequest({ authorization: 'bearer secret' }),
    apnsRequest({ authorization: 'bearer eA.eA.eA' }),
    apnsRequest({}, apnsToken, { aps: null }),
    fcmRequest({ android: [] }),
    apnsRequest({}, apnsToken, { aps: { alert: 'sensitive'.repeat(1000) } }),
    new Request(oauth, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'sensitive'.repeat(2000),
    }),
  ])
    await expect(authorize(request)).rejects.toThrow(/^Staging push request rejected$/);
});
test('composed egress forwards unchanged bytes without redirects and blocks unapproved devices', async () => {
  const upstream = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValue(new Response('{}'));
  const send = stagingFetch(
    {
      projectUrl: environment.SUPABASE_URL,
      orchestratorUrl: 'https://doji-orchestrator-staging.faheygs.workers.dev',
      ablyKey: 'eVKl2g.synthetic:synthetic',
      push: policy(),
    },
    upstream,
  );
  const input = fcmRequest();
  const expected = await input.clone().text();
  await send(input);
  const output = upstream.mock.calls[0][0] as Request;
  expect(output.redirect).toBe('error');
  expect(await output.text()).toBe(expected);
  await expect(send(fcmRequest({ token: 'unapproved-device' }))).rejects.toThrow(
    'destination denied',
  );
  expect(upstream).toHaveBeenCalledTimes(1);
  await send(environment.SUPABASE_URL + '/rest/v1/rpc/synthetic');
  expect(upstream).toHaveBeenCalledTimes(2);
});
