import { readJsonBody, readOptionalJsonBody } from '../../supabase/functions/_shared/json-body';
import { fetchWithTimeout } from '../../supabase/functions/_shared/fetch-timeout';
import { assertCronAuthorized } from '../../supabase/functions/_shared/cron-auth';
import { resolvePushPolicy } from '../../supabase/functions/_shared/notification-policy';
import { pushPreferenceEnabled } from '../../supabase/functions/_shared/notification-preferences';
import {
  buildAblyMessages,
  getPushExpiresAtMs,
  isPushFresh,
  type DeliveryEvent,
} from '../../supabase/functions/_shared/domain-event-delivery';
import {
  claimPushDelivery,
  recordPushDeliveryResults,
} from '../../supabase/functions/_shared/push-delivery';
import { logRealtimeLatency } from '../../supabase/functions/_shared/realtime-latency';
import { sendExpoPushMessages, EXPO_PUSH_URL } from '../../supabase/functions/_shared/expo-push';

const transport = jest.fn();
const originalFetch = global.fetch;
const originalDeno = Object.getOwnPropertyDescriptor(globalThis, 'Deno');
let secret: string | undefined;
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = transport;
  transport.mockReset().mockResolvedValue(Response.json({ data: [] }));
  secret = 'synthetic-cron-only';
  Object.defineProperty(globalThis, 'Deno', {
    configurable: true,
    value: { env: { get: () => secret } },
  });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  global.fetch = originalFetch;
  if (originalDeno) Object.defineProperty(globalThis, 'Deno', originalDeno);
  else Reflect.deleteProperty(globalThis, 'Deno');
  jest.restoreAllMocks();
});
const request = (body?: string, headers?: HeadersInit) =>
  new Request('https://synthetic.invalid/', { method: 'POST', body, headers });

test.each(['', ' ', undefined])(
  'required body rejects empty input while optional body returns its fallback (%s)',
  async (body) => {
    await expect(readJsonBody(request(body))).rejects.toThrow('Request body is required');
    await expect(readOptionalJsonBody(request(body), { empty: true })).resolves.toEqual({
      empty: true,
    });
  },
);
test('bounded body parsers retain JSON values and reject malformed input', async () => {
  await expect(readJsonBody(request('{"message":"é"}'))).resolves.toEqual({ message: 'é' });
  await expect(readOptionalJsonBody(request('[1]'), [])).resolves.toEqual([1]);
  await expect(readJsonBody(request('broken'))).rejects.toThrow();
});
test.each([
  ['10', '{}'],
  ['invalid', '"ééé"'],
  [null, '"ééé"'],
] as const)('body limits apply to declared and received bytes (%s)', async (length, body) => {
  await expect(
    readJsonBody(request(body, length ? { 'content-length': length } : undefined), 4),
  ).rejects.toThrow('too large');
});
test('streamed JSON handles multibyte characters split between chunks and releases the reader', async () => {
  const bytes = new TextEncoder().encode('{"value":"é"}');
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  const req = new Request('https://synthetic.invalid', {
    method: 'POST',
    body: stream,
    duplex: 'half',
  } as RequestInit);
  await expect(readJsonBody(req)).resolves.toEqual({ value: 'é' });
  expect(req.body?.locked).toBe(false);
});
test('provider request creates a deadline unless the caller already supplied its signal', async () => {
  await fetchWithTimeout('https://synthetic.invalid');
  expect(transport.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  const controller = new AbortController();
  await fetchWithTimeout(
    new URL('https://synthetic.invalid'),
    { method: 'POST', signal: controller.signal },
    100,
  );
  expect(transport.mock.calls[1][1]).toEqual({ method: 'POST', signal: controller.signal });
});
test.each([
  undefined,
  '',
  'Basic synthetic-cron-only',
  'Bearer wrong',
  'Bearer synthetic-cron-only',
])('cron authentication validates its exact bearer (%s)', async (authorization) => {
  const result = assertCronAuthorized(
    request(undefined, authorization ? { authorization } : undefined),
  );
  if (authorization === 'Bearer synthetic-cron-only') expect(result).toBeNull();
  else {
    expect(result?.status).toBe(401);
    expect(await result?.json()).toEqual({ error: 'Unauthorized' });
  }
});
test('missing cron secret fails closed', async () => {
  secret = undefined;
  const result = assertCronAuthorized(request());
  expect(result?.status).toBe(500);
  expect(await result?.json()).toEqual({ error: 'CRON_SECRET is not configured' });
});

const at = Date.parse('2026-10-02T00:00:00Z');
const event = (
  event_type = 'notification.mention.created',
  payload: Record<string, unknown> = {},
): DeliveryEvent => ({
  id: 'event',
  event_type,
  aggregate_id: 'aggregate',
  payload,
  created_at: new Date(at).toISOString(),
  available_at: new Date(at).toISOString(),
});
test.each([
  [
    'notification.friend_request.created',
    'friendshipId',
    'friendship',
    'friend_requests',
    'friend-request',
  ],
  ['notification.mention.created', 'commentId', 'comment', 'mentions_replies', 'comment'],
  ['notification.comment_reply.created', 'commentId', 'comment', 'mentions_replies', 'comment'],
  [
    'notification.suggestion.reviewed',
    'suggestionId',
    'suggestion',
    'reviews_account',
    'challenge-review',
  ],
  [
    'moderation.status.changed',
    'decisionId',
    'moderation_decision',
    'reviews_account',
    'moderation-decision',
  ],
])(
  'targeted policy %s requires a target, push opt-in and exact subject',
  (type, field, scopeKind, preferenceKey, collapse) => {
    const e = event(type, { sendPush: true, targetUserId: ' member ', [field]: ' subject ' });
    expect(resolvePushPolicy(e)).toMatchObject({
      mode: 'targeted',
      scopeKind,
      scopeId: 'subject',
      preferenceKey,
      collapseKey: `${collapse}:subject`,
    });
    expect(resolvePushPolicy({ ...e, payload: { ...e.payload, [field]: '' } })?.scopeId).toBe(
      'aggregate',
    );
    expect(
      resolvePushPolicy({
        ...e,
        aggregate_id: null,
        payload: { sendPush: true, targetUserId: 'member' },
      }),
    ).toBeNull();
    expect(resolvePushPolicy({ ...e, payload: { ...e.payload, sendPush: false } })).toBeNull();
    expect(resolvePushPolicy({ ...e, payload: { ...e.payload, targetUserId: 42 } })).toBeNull();
  },
);
test('activation broadcast has time-sensitive daily-event scope and cannot invent a missing identity', () => {
  const e = event('doji.activated', { broadcastPush: true, dailyEventId: 'day' });
  expect(resolvePushPolicy(e)).toMatchObject({
    mode: 'broadcast',
    channelId: 'doji-live',
    interruptionLevel: 'time-sensitive',
    scopeKind: 'daily_event',
    scopeId: 'day',
  });
  expect(resolvePushPolicy(event('doji.activated', { broadcastPush: true }))?.scopeId).toBe(
    'aggregate',
  );
  expect(
    resolvePushPolicy({ ...e, aggregate_id: null, payload: { broadcastPush: true } }),
  ).toBeNull();
  expect(resolvePushPolicy(event('doji.activated'))).toBeNull();
  expect(
    resolvePushPolicy(event('unknown', { sendPush: true, targetUserId: 'member' })),
  ).toBeNull();
});
test.each([null, undefined])('absent preferences use defaults (%s)', (preferences) =>
  expect(pushPreferenceEnabled(preferences, 'doji_live')).toBe(true),
);
test.each([
  ['doji_live', 'doji_start'],
  ['friend_requests', 'friend_request'],
  ['mentions_replies', 'mention'],
  ['mentions_replies', 'comment_reply'],
  ['reviews_account', 'suggestion'],
])('legacy %s opt-out %s is respected', (key, alias) => {
  expect(pushPreferenceEnabled({}, key)).toBe(true);
  expect(pushPreferenceEnabled({ push_enabled: false }, key)).toBe(false);
  expect(pushPreferenceEnabled({ [key]: false }, key)).toBe(false);
  expect(pushPreferenceEnabled({ [alias]: false }, key)).toBe(false);
});
test('unknown or absent preference categories never override a master opt-out', () => {
  expect(pushPreferenceEnabled({}, null)).toBe(true);
  expect(pushPreferenceEnabled({}, 'future')).toBe(true);
  expect(pushPreferenceEnabled({ push_enabled: false }, null)).toBe(false);
});
test('realtime identifiers are server-owned even when a payload attempts to replace them', () => {
  expect(
    buildAblyMessages([
      event('changed', {
        eventId: 'forged',
        aggregateId: 'forged',
        occurredAt: 'forged',
        id: 'item',
      }),
    ]),
  ).toEqual([
    {
      name: 'changed',
      data: {
        eventId: 'event',
        aggregateId: 'aggregate',
        occurredAt: new Date(at).toISOString(),
        id: 'item',
      },
    },
  ]);
});
test('push freshness observes source-action time, exact expiry, close time and future-skew limit', () => {
  const social = event('notification.mention.created', { sendPush: true });
  expect(isPushFresh(social, at + 299999)).toBe(true);
  expect(isPushFresh(social, at + 300000)).toBe(false);
  expect(isPushFresh(event(), at + 9e9)).toBe(true);
  expect(getPushExpiresAtMs({ ...social, created_at: 'invalid' }, at)).toBeNull();
  expect(
    getPushExpiresAtMs(event('changed', { occurredAt: new Date(at - 60_000).toISOString() }), at),
  ).toBe(at + 240000);
  expect(
    getPushExpiresAtMs({ ...social, created_at: new Date(at + 30001).toISOString() }, at),
  ).toBeNull();
  expect(
    getPushExpiresAtMs({ ...social, created_at: new Date(at + 30000).toISOString() }, at),
  ).toBe(at + 330000);
  expect(getPushExpiresAtMs(event('doji.activated', { broadcastPush: true }), at)).toBe(
    at + 120000,
  );
  expect(
    getPushExpiresAtMs(
      event('doji.activated', { closesAt: new Date(at + 30_000).toISOString() }),
      at,
    ),
  ).toBe(at + 30000);
});
test.each([true, false, null, 'true'])(
  'delivery claims accept only an atomic true result (%j)',
  async (data) => {
    const database = { rpc: jest.fn().mockResolvedValue({ data, error: null }) };
    expect(
      await claimPushDelivery(database, {
        deliveryKey: 'key',
        targetUserId: 'member',
        category: 'mention',
      }),
    ).toBe(data === true);
    expect(database.rpc).toHaveBeenCalledWith('claim_push_delivery', {
      p_delivery_key: 'key',
      p_target_user_id: 'member',
      p_category: 'mention',
      p_aggregate_id: null,
    });
  },
);
test('claim failure is not a delivery grant, whereas telemetry failure never unlocks a resend', async () => {
  const error = { message: 'temporary' };
  const database = { rpc: jest.fn().mockResolvedValue({ data: null, error }) };
  await expect(
    claimPushDelivery(database, {
      deliveryKey: 'key',
      targetUserId: 'member',
      category: 'mention',
      aggregateId: 'subject',
    }),
  ).rejects.toBe(error);
  await recordPushDeliveryResults(database, []);
  expect(database.rpc).toHaveBeenCalledTimes(1);
  await expect(
    recordPushDeliveryResults(database, [
      { deliveryKey: 'key', outcome: 'accepted', providerTicketId: 'ticket' },
    ]),
  ).resolves.toBeUndefined();
  expect(console.error).toHaveBeenCalledWith(
    'Could not record terminal push results:',
    'temporary',
  );
});
test.each([5000, 5001])(
  'latency metrics use available time and warn only beyond the 5-second objective (%i)',
  (max) => {
    jest.spyOn(Date, 'now').mockReturnValue(at);
    logRealtimeLatency([]);
    expect(console.log).not.toHaveBeenCalled();
    logRealtimeLatency(
      [0, 1000, max].map((age) => ({
        topic: 'post:synthetic',
        created_at: new Date(at - 999999).toISOString(),
        available_at: new Date(at - age).toISOString(),
      })),
    );
    const sink = max > 5000 ? console.warn : console.log;
    expect(JSON.parse(jest.mocked(sink).mock.calls[0][0])).toEqual({
      metric: 'domain_realtime_publish',
      count: 3,
      p50Ms: 1000,
      p95Ms: max,
      maxMs: max,
      topic: 'post:synthetic',
    });
  },
);
const message = {
  to: 'ExponentPushToken[synthetic]',
  title: 'Synthetic',
  body: 'Synthetic test only',
};
test('empty Expo batches never contact a provider', async () => {
  expect(await sendExpoPushMessages([])).toEqual({
    httpOk: true,
    tickets: [],
    invalidTokenIndices: [],
  });
  expect(transport).not.toHaveBeenCalled();
});
test.each([false, true])(
  'Expo tickets preserve index correspondence for wrapped=%s payload',
  async (wrapped) => {
    const tickets = [
      { status: 'ok', id: 'accepted' },
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
      { status: 'error', details: { error: 'InvalidCredentials' } },
      { status: 'error' },
      { status: 'error', details: { error: 'MessageTooBig' } },
    ];
    transport.mockResolvedValue(Response.json(wrapped ? { data: tickets } : tickets));
    const result = await sendExpoPushMessages(tickets.map(() => message));
    expect(result).toMatchObject({ httpOk: true, tickets, invalidTokenIndices: [1, 2] });
    expect(transport).toHaveBeenCalledWith(
      EXPO_PUSH_URL,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(tickets.map(() => message)),
        signal: expect.any(AbortSignal),
      }),
    );
  },
);
test.each([null, {}, { data: {} }, 'invalid'])(
  'unexpected Expo response shape gives no invented acceptance (%j)',
  async (data) => {
    transport.mockResolvedValue(data === 'invalid' ? new Response('invalid') : Response.json(data));
    expect((await sendExpoPushMessages([message])).tickets).toEqual([]);
  },
);
test('Expo HTTP errors remain terminal request failures', async () => {
  transport.mockResolvedValue(Response.json({}, { status: 503 }));
  expect(await sendExpoPushMessages([message])).toMatchObject({
    httpOk: false,
    httpStatus: 503,
    transportError: 'Expo push HTTP 503',
  });
});
test.each([new Error('offline'), 'disconnected'])(
  'Expo transport errors are returned without throwing or inventing tickets (%j)',
  async (error) => {
    transport.mockRejectedValue(error);
    expect(await sendExpoPushMessages([message])).toMatchObject({
      httpOk: false,
      tickets: [],
      invalidTokenIndices: [],
      transportError: error instanceof Error ? error.message : error,
    });
  },
);
