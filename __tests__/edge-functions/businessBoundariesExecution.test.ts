import { webcrypto, createHmac } from 'node:crypto';
import { signBusinessLink, readBusinessLink } from '../../supabase/functions/_shared/business-link';
import { executeBusinessErasure } from '../../supabase/functions/_shared/business-erasure';
import {
  businessRealtimeToken,
  assertBusinessEvent,
  isBusinessEvent,
  BUSINESS_TOKEN_TTL,
} from '../../supabase/functions/_shared/business-realtime';

const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const executionId = '11111111-2222-4333-8444-555555555555';
const origin = 'https://business.synthetic.invalid';
const secret = 'synthetic-signing-key-at-least-32-characters';
const ticket = {
  id,
  email: 'synthetic@example.invalid',
  token_hash: 'synthetic-otp',
  type: 'signup' as const,
};
const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
});
afterAll(() => {
  if (cryptoDescriptor) Object.defineProperty(globalThis, 'crypto', cryptoDescriptor);
  else Reflect.deleteProperty(globalThis, 'crypto');
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test.each(['signup', 'recovery'] as const)(
  'business %s link verifies its signature, purpose, origin and lifetime',
  async (type) => {
    const value = await signBusinessLink({ ...ticket, type }, secret, origin);
    expect(await readBusinessLink(value, secret, origin)).toMatchObject({ ...ticket, type });
    expect(await readBusinessLink(value, secret, 'https://employee.synthetic.invalid')).toBeNull();
    expect(await readBusinessLink(value, secret + 'changed', origin)).toBeNull();
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 3600001);
    expect(await readBusinessLink(value, secret, origin)).toBeNull();
  },
);
test.each([undefined, null, '', 'bad', 'a.b.c', 'x'.repeat(2501), 'payload.signature'])(
  'invalid link input never becomes an identity (%j)',
  async (input) => expect(await readBusinessLink(input, secret, origin)).toBeNull(),
);
test('short signing keys fail closed on both creation and verification', async () => {
  await expect(signBusinessLink(ticket, 'short', origin)).rejects.toThrow('unavailable');
  expect(await readBusinessLink('a.b', 'short', origin)).toBeNull();
});
test.each([
  { id: 'not-uuid' },
  { email: null },
  { token_hash: null },
  { token_hash: '' },
  { type: 'employee' },
  { expires: 2.5 },
  { expires: Math.floor(Date.now() / 1000) - 1 },
  { expires: Math.floor(Date.now() / 1000) + 7200 },
])('even correctly signed malformed tickets are rejected (%j)', async (patch) => {
  const payload = Buffer.from(
    JSON.stringify({ ...ticket, expires: Math.floor(Date.now() / 1000) + 3600, ...patch }),
  ).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(`doji-business-access-v1\n${origin}\n${payload}`)
    .digest('base64url');
  expect(await readBusinessLink(`${payload}.${signature}`, secret, origin)).toBeNull();
});
test('correct signature cannot make malformed JSON a valid ticket', async () => {
  const payload = Buffer.from('broken-json').toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(`doji-business-access-v1\n${origin}\n${payload}`)
    .digest('base64url');
  expect(await readBusinessLink(`${payload}.${signature}`, secret, origin)).toBeNull();
});

const erasureConfig = {
  enabled: true,
  supabaseUrl: 'https://db.synthetic.invalid',
  serviceKey: 'sb_secret_synthetic',
};
const identity = { id, role: 'doji_business', app_metadata: { account_type: 'business' } };
function erasureTransport(
  options: {
    claim?: unknown;
    claimStatus?: number;
    identity?: unknown;
    readStatus?: number;
    deleteStatus?: number;
    remains?: boolean;
    gone?: boolean;
    finishStatus?: number;
  } = {},
) {
  let gone = options.gone ?? false;
  return jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/claim_business_erasure_v1'))
      return Response.json(
        options.claim ?? { account_id: id, state: 'executing', delete_authorized: true },
        { status: options.claimStatus ?? 200 },
      );
    if (path.endsWith('/finish_business_erasure_v1'))
      return Response.json({ state: 'primary_erased' }, { status: options.finishStatus ?? 200 });
    expect(path).toBe(`/auth/v1/admin/users/${id}`);
    if (init?.method === 'GET')
      return Response.json(gone ? { code: 'user_not_found' } : (options.identity ?? identity), {
        status: gone ? 404 : (options.readStatus ?? 200),
      });
    expect(init?.method).toBe('DELETE');
    expect(JSON.parse(String(init?.body))).toEqual({ should_soft_delete: false });
    if (!options.remains && !options.deleteStatus) gone = true;
    return Response.json({}, { status: options.deleteStatus ?? 200 });
  });
}
test('disabled business erasure never contacts any identity provider', async () => {
  const upstream = erasureTransport();
  expect(
    await executeBusinessErasure({ ...erasureConfig, enabled: false }, '', '', upstream),
  ).toEqual({ state: 'disabled' });
  expect(upstream).not.toHaveBeenCalled();
});
test.each([
  ['bad', executionId],
  [id, 'bad'],
])('erasure requires exact UUID case/execution identifiers (%s/%s)', async (caseId, runId) => {
  const upstream = erasureTransport();
  await expect(executeBusinessErasure(erasureConfig, caseId, runId, upstream)).rejects.toThrow(
    'Exact',
  );
  expect(upstream).not.toHaveBeenCalled();
});
test.each([
  'http://host.invalid',
  'https://user:pass@host.invalid',
  'https://host.invalid/path',
  'https://host.invalid?query=1',
  'https://host.invalid/#hash',
])('unsafe erasure service origin is rejected (%s)', async (supabaseUrl) => {
  const upstream = erasureTransport();
  await expect(
    executeBusinessErasure({ ...erasureConfig, supabaseUrl }, id, executionId, upstream),
  ).rejects.toThrow();
  expect(upstream).not.toHaveBeenCalled();
});
test('missing service key prevents erasure', async () => {
  const upstream = erasureTransport();
  await expect(
    executeBusinessErasure({ ...erasureConfig, serviceKey: '' }, id, executionId, upstream),
  ).rejects.toThrow('configuration');
  expect(upstream).not.toHaveBeenCalled();
});
test.each(['primary_erased', 'completed'])(
  'already %s erasure only reads its durable claim',
  async (state) => {
    const upstream = erasureTransport({ claim: { account_id: id, state } });
    expect(await executeBusinessErasure(erasureConfig, id, executionId, upstream)).toEqual({
      state,
    });
    expect(upstream).toHaveBeenCalledTimes(1);
  },
);
test.each([
  { claimStatus: 403 },
  { claim: { account_id: 'wrong' } },
  { identity: { ...identity, id: executionId } },
  { identity: { ...identity, role: 'authenticated' } },
  { identity: { ...identity, app_metadata: { account_type: 'employee' } } },
  { readStatus: 500 },
])('erasure fails before DELETE when exact authorization is unverified (%j)', async (options) => {
  const upstream = erasureTransport(options);
  await expect(executeBusinessErasure(erasureConfig, id, executionId, upstream)).rejects.toThrow();
  expect(upstream.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
});
test.each([
  { claim: { account_id: id, state: 'executing', delete_authorized: false } },
  { deleteStatus: 503 },
  { remains: true },
])('ambiguous erasure requires review and never reports completion (%j)', async (options) => {
  const upstream = erasureTransport(options);
  expect(await executeBusinessErasure(erasureConfig, id, executionId, upstream)).toEqual({
    state: 'needs_auth_review',
  });
  expect(upstream.mock.calls.some(([url]) => String(url).includes('finish_business_erasure'))).toBe(
    false,
  );
});
test.each([false, true])(
  'erasure reconciles exact provider absence before finishing (alreadyGone=%s)',
  async (gone) => {
    const upstream = erasureTransport({ gone });
    expect(await executeBusinessErasure(erasureConfig, id, executionId, upstream)).toEqual({
      state: 'primary_erased',
    });
    expect(upstream.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(
      gone ? 0 : 1,
    );
    for (const [, init] of upstream.mock.calls) {
      expect(init?.headers).toMatchObject({ apikey: 'sb_secret_synthetic' });
      expect(init?.headers).not.toHaveProperty('authorization');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  },
);
test('erasure allows only explicit loopback HTTP for local verification', async () => {
  const upstream = erasureTransport({ gone: true });
  expect(
    await executeBusinessErasure(
      { ...erasureConfig, supabaseUrl: 'http://127.0.0.1:1234' },
      id,
      executionId,
      upstream,
    ),
  ).toEqual({ state: 'primary_erased' });
});
test('failed final erasure acknowledgement is never reported as completion', async () => {
  await expect(
    executeBusinessErasure(
      erasureConfig,
      id,
      executionId,
      erasureTransport({ gone: true, finishStatus: 503 }),
    ),
  ).rejects.toThrow('restricted review');
});

const realtimeEnv = {
  enabled: true,
  origin,
  supabaseUrl: 'https://db.synthetic.invalid',
  anonKey: 'public-test',
};
const realtimeRequest = (
  body = '{}',
  method = 'POST',
  authorization: string | null = 'Bearer member-token',
  requestOrigin = origin,
) =>
  new Request(`${origin}/token`, {
    method,
    headers: { origin: requestOrigin, ...(authorization ? { authorization } : {}) },
    ...(method === 'POST' ? { body } : {}),
  });
test('business token grants only subscribe on the database-authorized exact user channel', async () => {
  const sign = jest.fn().mockResolvedValue({ signed: 'synthetic' });
  const upstream = jest
    .fn()
    .mockResolvedValue(
      Response.json({ allowed: true, userId: id, topic: `business:${id}:events` }),
    );
  const response = await businessRealtimeToken(realtimeRequest(), realtimeEnv, sign, upstream);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(sign).toHaveBeenCalledWith({
    clientId: `business:${id}`,
    ttl: BUSINESS_TOKEN_TTL,
    capability: JSON.stringify({ [`business:${id}:events`]: ['subscribe'] }),
  });
  expect(upstream).toHaveBeenCalledWith(
    `${realtimeEnv.supabaseUrl}/rest/v1/rpc/get_business_realtime_capability_v1`,
    expect.objectContaining({
      headers: {
        authorization: 'Bearer member-token',
        apikey: 'public-test',
        'content-type': 'application/json',
      },
      body: '{}',
      signal: expect.any(AbortSignal),
    }),
  );
});
test.each([
  { enabled: false },
  { origin: 'bad' },
  { origin: 'http://insecure.test' },
  { origin: origin + '/' },
  { supabaseUrl: 'http://db.test' },
  { supabaseUrl: 'https://db.test/path' },
  { anonKey: '' },
])('business token rejects unavailable or unsafe configuration (%j)', async (patch) => {
  const upstream = jest.fn();
  const sign = jest.fn();
  expect(
    (await businessRealtimeToken(realtimeRequest(), { ...realtimeEnv, ...patch }, sign, upstream))
      .status,
  ).toBe(patch.enabled === false ? 404 : 503);
  expect(upstream).not.toHaveBeenCalled();
  expect(sign).not.toHaveBeenCalled();
});
test.each([
  ['{}', 'OPTIONS', 'Bearer token', origin, 204],
  ['{}', 'GET', 'Bearer token', origin, 405],
  ['{}', 'POST', null, origin, 401],
  ['{}', 'POST', 'Basic token', origin, 401],
  ['{}', 'POST', 'Bearer ' + 'x'.repeat(8192), origin, 401],
  ['{}', 'POST', 'Bearer token', 'https://evil.invalid', 403],
] as const)(
  'realtime transport gates %s %s before authorization',
  async (body, method, authorization, requestOrigin, status) => {
    const upstream = jest.fn();
    expect(
      (
        await businessRealtimeToken(
          realtimeRequest(body, method, authorization, requestOrigin),
          realtimeEnv,
          jest.fn(),
          upstream,
        )
      ).status,
    ).toBe(status);
    expect(upstream).not.toHaveBeenCalled();
  },
);
test.each(['null', '[]', '42', '{"topic":"arbitrary"}', 'broken', 'x'.repeat(257)])(
  'realtime forbids caller-selected subscription input (%s)',
  async (body) => {
    const upstream = jest.fn();
    expect(
      (await businessRealtimeToken(realtimeRequest(body), realtimeEnv, jest.fn(), upstream)).status,
    ).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  },
);
test.each([401, 403, 500])(
  'authorization failure status %i is preserved or safely mapped',
  async (status) => {
    const sign = jest.fn();
    expect(
      (
        await businessRealtimeToken(
          realtimeRequest(),
          realtimeEnv,
          sign,
          jest.fn().mockResolvedValue(Response.json({}, { status })),
        )
      ).status,
    ).toBe(status === 500 ? 503 : status);
    expect(sign).not.toHaveBeenCalled();
  },
);
test.each([
  [{ allowed: false }, 429],
  [{ allowed: true, userId: 'bad', topic: 'business:bad:events' }, 503],
  [{ allowed: true, userId: id, topic: 'moderation:global' }, 503],
  [null, 503],
] as const)('untrusted capability response cannot expand access (%j)', async (data, status) => {
  const sign = jest.fn();
  expect(
    (
      await businessRealtimeToken(
        realtimeRequest(),
        realtimeEnv,
        sign,
        jest.fn().mockResolvedValue(Response.json(data)),
      )
    ).status,
  ).toBe(status);
  expect(sign).not.toHaveBeenCalled();
});
test.each(['provider', 'signer', 'malformed'])(
  'realtime %s failure returns a safe retry boundary',
  async (kind) => {
    const upstream =
      kind === 'provider'
        ? jest.fn().mockRejectedValue(new Error('private error'))
        : jest
            .fn()
            .mockResolvedValue(
              kind === 'malformed'
                ? new Response('not-json')
                : Response.json({ allowed: true, userId: id, topic: `business:${id}:events` }),
            );
    const response = await businessRealtimeToken(
      realtimeRequest(),
      realtimeEnv,
      jest.fn().mockRejectedValue(new Error('signer private error')),
      upstream,
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private error');
  },
);
test('stalled token signer is bounded and its timer is cleaned up', async () => {
  jest.useFakeTimers();
  const upstream = jest
    .fn()
    .mockResolvedValue(
      Response.json({ allowed: true, userId: id, topic: `business:${id}:events` }),
    );
  const pending = businessRealtimeToken(
    realtimeRequest(),
    realtimeEnv,
    () => new Promise(() => {}),
    upstream,
  );
  await jest.advanceTimersByTimeAsync(8000);
  expect((await pending).status).toBe(503);
  expect(jest.getTimerCount()).toBe(0);
});
const businessEvent = {
  topic: `business:${id}:events`,
  event_type: 'business.application.updated',
  aggregate_id: executionId,
  payload: { applicationId: executionId, applicantId: id, sendPush: false },
};
test('business realtime envelopes are identifier-only and do not affect member events', () => {
  expect(isBusinessEvent(businessEvent)).toBe(true);
  expect(() => assertBusinessEvent(businessEvent, true)).not.toThrow();
  expect(() => assertBusinessEvent(businessEvent, false)).toThrow('disabled');
  const member = {
    topic: 'post:one',
    event_type: 'feed.comment.created',
    aggregate_id: 'one',
    payload: {},
  };
  expect(isBusinessEvent(member)).toBe(false);
  expect(() => assertBusinessEvent(member, false)).not.toThrow();
  expect(() =>
    assertBusinessEvent(
      {
        ...businessEvent,
        topic: 'moderation:global',
        event_type: 'moderation.business.updated',
        payload: { applicationId: executionId, sendPush: false, realtimePublished: true },
      },
      true,
    ),
  ).not.toThrow();
});
test.each([
  { event_type: 'business.unknown' },
  { aggregate_id: id },
  { topic: 'business:other:events' },
  { payload: { ...businessEvent.payload, applicationId: 'bad' } },
  { payload: { ...businessEvent.payload, applicantId: 'bad' } },
  { payload: { ...businessEvent.payload, sendPush: true } },
  { payload: { ...businessEvent.payload, realtimePublished: false } },
  { payload: { ...businessEvent.payload, private_content: 'forbidden' } },
  {
    topic: 'wrong',
    event_type: 'moderation.business.updated',
    payload: { applicationId: executionId, sendPush: false },
  },
])('malformed business envelope is rejected (%j)', (patch) =>
  expect(() => assertBusinessEvent({ ...businessEvent, ...patch }, true)).toThrow(
    'Invalid business realtime envelope',
  ),
);
