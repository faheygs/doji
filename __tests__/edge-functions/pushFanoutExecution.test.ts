jest.mock(
  'https://esm.sh/@supabase/supabase-js@2',
  () => ({ createClient: () => ({ rpc: mockRpc }) }),
  { virtual: true },
);
jest.mock('../../supabase/functions/_shared/apns-push', () => ({
  apnsConfigured: () => mockProviders.apns,
  sendApnsMessage: (...args: unknown[]) => mockApns(...args),
}));
jest.mock('../../supabase/functions/_shared/fcm-push', () => ({
  fcmConfigured: () => mockProviders.fcm,
  sendFcmMessage: (...args: unknown[]) => mockFcm(...args),
}));
jest.mock('../../supabase/functions/_shared/expo-push', () => ({
  sendExpoPushMessages: (...args: unknown[]) => mockExpo(...args),
}));
const mockRpc = jest.fn();
const mockApns = jest.fn();
const mockFcm = jest.fn();
const mockExpo = jest.fn();
let mockProviders = { apns: true, fcm: true };
const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Deno');
let settings: Record<string, string | undefined>;
let handler: (request: Request) => Promise<Response>;
const eventId = '11111111-1111-4111-8111-111111111111';
type Endpoint = {
  token: string;
  provider: string;
  installationId: string;
  environment?: string;
  notificationContractVersion?: number;
};
type Recipient = {
  user_id: string;
  notification_token: string | null;
  native_endpoints: Endpoint[] | null;
};
let recipients: Recipient[];
let claim: Record<string, unknown>;
const endpoint = (provider: string, version?: number): Endpoint => ({
  token: `${provider}-token`,
  provider,
  installationId: `${provider}-installation`,
  notificationContractVersion: version,
});
const recipient = (
  user = 'user',
  native: Endpoint[] | null = [],
  token: string | null = 'ExponentPushToken[synthetic]',
): Recipient => ({ user_id: user, notification_token: token, native_endpoints: native });
const request = (body: unknown = { dailyEventId: eventId, shard: 0 }, secret = 'synthetic') =>
  new Request('https://synthetic.invalid', {
    method: 'POST',
    headers: { 'x-outbox-secret': secret, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const rpcCalls = (name: string) =>
  mockRpc.mock.calls.filter(([n]) => n === name).map(([, args]) => args);
function database(name: string, args: Record<string, unknown>) {
  if (name === 'claim_doji_push_fanout_shard') return { data: claim };
  if (name === 'get_doji_push_recipients_shard_page') return { data: recipients };
  if (name === 'claim_push_delivery_targets_batch_v2')
    return {
      data: (args.p_targets as { userId: string; endpointKey: string }[]).map((t) => ({
        target_user_id: t.userId,
        endpoint_key: t.endpointKey,
        delivery_key: `${t.userId}:${t.endpointKey}`,
      })),
    };
  if (name === 'list_doji_push_fanout_shards') return { data: [0, 1] };
  return { data: true, error: null };
}
beforeEach(() => {
  settings = {
    SUPABASE_URL: 'https://database.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic',
    OUTBOX_RELAY_SECRET: 'synthetic',
  };
  Object.defineProperty(globalThis, 'Deno', {
    configurable: true,
    value: {
      env: { get: (key: string) => settings[key] },
      serve: (callback: typeof handler) => {
        handler = callback;
      },
    },
  });
  mockProviders = { apns: true, fcm: true };
  claim = {
    state: 'claimed',
    lease_id: 'lease',
    push_expires_at: new Date(Date.now() + 300000).toISOString(),
  };
  recipients = [recipient()];
  mockRpc.mockReset().mockImplementation(async (name, args) => database(name, args));
  mockApns.mockReset().mockResolvedValue({ outcome: 'accepted', providerId: 'apns-ticket' });
  mockFcm.mockReset().mockResolvedValue({ outcome: 'accepted', providerId: 'fcm-ticket' });
  mockExpo.mockReset().mockImplementation(async (messages: unknown[]) => ({
    httpOk: true,
    invalidTokenIndices: [],
    tickets: messages.map(() => ({ status: 'ok', id: 'expo-ticket' })),
  }));
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.isolateModules(() => require('../../supabase/functions/fanout-doji-push/index'));
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => {
  if (descriptor) Object.defineProperty(globalThis, 'Deno', descriptor);
  else Reflect.deleteProperty(globalThis, 'Deno');
});
test.each([undefined, ''])('requires configured service secret %s', async (secret) => {
  settings.OUTBOX_RELAY_SECRET = secret;
  expect((await handler(request())).status).toBe(401);
  expect(mockRpc).not.toHaveBeenCalled();
});
test('rejects wrong service caller', async () => {
  expect((await handler(request({}, 'wrong'))).status).toBe(401);
});
test('requires event before database operations', async () => {
  expect((await handler(request({}))).status).toBe(400);
  expect(mockRpc).not.toHaveBeenCalled();
});
test.each([null, 4])('explicit expiry persists authoritative count %s', async (count) => {
  mockRpc.mockResolvedValue({ data: count });
  expect(await (await handler(request({ dailyEventId: eventId, expire: true }))).json()).toEqual({
    expired: count ?? 0,
  });
  expect(mockRpc).toHaveBeenCalledWith('expire_doji_push_fanout', {
    p_daily_event_id: eventId,
    p_error: expect.any(String),
  });
});
test.each([
  'expire_doji_push_fanout',
  'list_doji_push_fanout_shards',
  'claim_doji_push_fanout_shard',
])('early RPC %s error is not acknowledged', async (failed) => {
  mockRpc.mockResolvedValue({ error: { message: 'synthetic failure' } });
  const body =
    failed === 'expire_doji_push_fanout'
      ? { dailyEventId: eventId, expire: true }
      : failed === 'list_doji_push_fanout_shards'
        ? { dailyEventId: eventId }
        : { dailyEventId: eventId, shard: 0 };
  expect((await handler(request(body))).status).toBe(500);
  expect(mockExpo).not.toHaveBeenCalled();
});
test.each([null, [0, 1]])('returns only array shard plan %j', async (data) => {
  mockRpc.mockResolvedValue({ data });
  expect(await (await handler(request({ dailyEventId: eventId }))).json()).toEqual({
    shards: data ?? [],
  });
});
test.each([-1, 128, 1.5, '0', null])('rejects invalid shard %s', async (shard) => {
  expect((await handler(request({ dailyEventId: eventId, shard }))).status).toBe(400);
  expect(mockRpc).not.toHaveBeenCalled();
});
test.each([undefined, 12])('busy shard returns retry delay %s without sending', async (delay) => {
  claim = { state: 'busy', retry_after_seconds: delay };
  const res = await handler(request());
  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({ continued: true, busy: true, retryAfterSeconds: delay ?? 5 });
  expect(mockExpo).not.toHaveBeenCalled();
});
test('completed shard is idempotent', async () => {
  claim.state = 'done';
  expect(await (await handler(request())).json()).toEqual({ continued: false, sent: 0 });
  expect(mockExpo).not.toHaveBeenCalled();
});
test.each(['lease_id', 'push_expires_at'])('missing lease %s blocks sending', async (key) => {
  delete claim[key];
  expect((await handler(request())).status).toBe(500);
  expect(mockExpo).not.toHaveBeenCalled();
});
test.each([true, false])(
  'expired launch closes shard with cursor present=%s, never sends',
  async (cursor) => {
    claim.push_expires_at = new Date(Date.now() - 1000).toISOString();
    if (cursor) claim.after_user_id = 'previous';
    expect(await (await handler(request())).json()).toEqual({
      continued: false,
      sent: 0,
      expired: true,
    });
    expect(rpcCalls('advance_doji_push_fanout_shard')[0]).toMatchObject({
      p_after_user_id: cursor ? 'previous' : null,
      p_has_more: false,
      p_claimed_count: 0,
      p_accepted_count: 0,
    });
    expect(mockExpo).not.toHaveBeenCalled();
  },
);
test.each([
  'get_doji_push_recipients_shard_page',
  'claim_push_delivery_targets_batch_v2',
  'advance_doji_push_fanout_shard',
])('failure at %s releases lease for bounded recovery', async (failed) => {
  mockRpc.mockImplementation(async (name, args) =>
    name === failed ? { error: { message: 'synthetic failure' } } : database(name, args),
  );
  expect((await handler(request())).status).toBe(500);
  expect(rpcCalls('release_doji_push_fanout_shard')).toHaveLength(1);
});
test('expired-page acknowledgement failure also releases lease', async () => {
  claim.push_expires_at = new Date(Date.now() - 1).toISOString();
  mockRpc.mockImplementation(async (name, args) =>
    name === 'advance_doji_push_fanout_shard' ? { error: 'expired failure' } : database(name, args),
  );
  expect((await handler(request())).status).toBe(500);
  expect(rpcCalls('release_doji_push_fanout_shard')[0].p_error).toBe('expired failure');
});
test('lost lease cannot advance cursor', async () => {
  mockRpc.mockImplementation(async (name, args) =>
    name === 'advance_doji_push_fanout_shard' ? { data: false } : database(name, args),
  );
  expect((await handler(request())).status).toBe(500);
  expect(rpcCalls('release_doji_push_fanout_shard')[0].p_error).toBe('Fanout lease was lost');
});
test.each([null, []])('empty recipients preserve last known cursor %j', async (value) => {
  claim.after_user_id = 'previous';
  mockRpc.mockImplementation(async (name, args) =>
    name === 'get_doji_push_recipients_shard_page' ? { data: value } : database(name, args),
  );
  expect(await (await handler(request())).json()).toMatchObject({
    continued: false,
    sent: 0,
    examined: 0,
  });
  expect(rpcCalls('advance_doji_push_fanout_shard')[0].p_after_user_id).toBe('previous');
});
test('no delivery claims means no resend', async () => {
  recipients = [recipient('native', [endpoint('apns')]), recipient('expo')];
  mockRpc.mockImplementation(async (name, args) =>
    name === 'claim_push_delivery_targets_batch_v2' ? { data: null } : database(name, args),
  );
  expect(await (await handler(request())).json()).toMatchObject({ sent: 0 });
  expect(mockApns).not.toHaveBeenCalled();
  expect(mockExpo).not.toHaveBeenCalled();
});
test.each([
  undefined,
  '',
  '  ',
  'You only have 10 minutes!',
  'Doji now. You have 10 minutes.',
  'Custom detail',
])('normalizes urgent body %s', async (input) => {
  claim.body = input;
  recipients = [
    recipient('apns', [endpoint('apns')]),
    recipient('fcm', [endpoint('fcm', 2)]),
    recipient('expo'),
  ];
  expect((await handler(request())).status).toBe(200);
  const expected = !input?.trim()
    ? 'You only have 10 minutes ⚠️'
    : input.includes('You only')
      ? input
      : input.endsWith('You have 10 minutes.')
        ? 'Doji now. You only have 10 minutes ⚠️'
        : `${input} — You only have 10 minutes ⚠️`;
  expect(mockApns.mock.calls[0][1]).toMatchObject({
    title: "It's time to Doji!",
    body: expected,
    environment: 'production',
    collapseId: `doji-live:${eventId}`,
    interruptionLevel: 'time-sensitive',
  });
  expect(mockFcm.mock.calls[0][0]).toMatchObject({
    body: expected,
    channelId: 'doji-live',
    ttlSeconds: expect.any(Number),
  });
  expect(mockExpo.mock.calls[0][0][0].body).toBe(expected);
});
test.each([1, 2, undefined])(
  'preserves native and Expo notification channel contract %s',
  async (version) => {
    recipients = [
      recipient('fcm', [endpoint('fcm', version)]),
      recipient('expo', [{ ...endpoint('unknown', version), token: '' }]),
    ];
    expect((await handler(request())).status).toBe(200);
    expect(mockFcm.mock.calls[0][0].channelId).toBe(version === 2 ? 'doji-live' : 'doji-alerts');
    expect(mockExpo.mock.calls[0][0][0].channelId).toBe(
      version === 2 ? 'doji-live' : 'doji-alerts',
    );
  },
);
test('configured native endpoints suppress duplicate Expo fallback, unsupported ones fall back safely', async () => {
  mockProviders.apns = false;
  recipients = [
    recipient('apns-off', [endpoint('apns')]),
    recipient('fcm', [endpoint('fcm')]),
    recipient('none', null, null),
    recipient('empty', [{ ...endpoint('fcm'), token: '' }]),
  ];
  expect(await (await handler(request())).json()).toMatchObject({
    sent: 3,
    apns: 0,
    fcm: 1,
    expoFallback: 2,
  });
  expect(rpcCalls('claim_push_delivery_targets_batch_v2')[0].p_targets).toEqual([
    { userId: 'apns-off', endpointKey: 'expo' },
    { userId: 'fcm', endpointKey: 'native:fcm-installation' },
    { userId: 'empty', endpointKey: 'expo' },
  ]);
});
test('full page creates five100-message Expo batches and marks continuation', async () => {
  recipients = Array.from({ length: 500 }, (_, i) => recipient(`user-${i}`));
  expect(await (await handler(request())).json()).toMatchObject({
    continued: true,
    sent: 500,
    examined: 500,
    expoFallback: 500,
  });
  expect(mockExpo).toHaveBeenCalledTimes(5);
  for (const [messages] of mockExpo.mock.calls) expect(messages).toHaveLength(100);
  expect(rpcCalls('advance_doji_push_fanout_shard')[0]).toMatchObject({
    p_after_user_id: 'user-499',
    p_claimed_count: 500,
    p_accepted_count: 500,
  });
});
test.each(['invalid_token', 'rejected', 'transport_error'])(
  'native outcome %s is recorded and selectively recovered',
  async (outcome) => {
    recipients = [recipient('a', [endpoint('apns')]), recipient('f', [endpoint('fcm')])];
    mockApns.mockResolvedValue({ outcome, error: 'synthetic' });
    mockFcm.mockResolvedValue({ outcome, error: 'synthetic' });
    const res = await handler(request());
    expect(res.status).toBe(outcome === 'transport_error' ? 500 : 200);
    if (outcome === 'invalid_token')
      expect(rpcCalls('invalidate_native_push_tokens')[0]).toEqual({
        p_tokens: ['apns-token', 'fcm-token'],
      });
    expect(rpcCalls('record_push_delivery_results')).toHaveLength(2);
    if (outcome === 'transport_error')
      expect(rpcCalls('advance_doji_push_fanout_shard')).toHaveLength(0);
  },
);
test.each(['invalid', 'rejected', 'transport', 'missing'])(
  'Expo %s outcomes never inflate acceptance',
  async (outcome) => {
    mockExpo.mockResolvedValue({
      httpOk: outcome !== 'transport',
      invalidTokenIndices: outcome === 'invalid' ? [0, 99] : [],
      tickets: outcome === 'missing' ? [] : [{ status: 'error', message: 'synthetic' }],
      transportError: 'synthetic',
    });
    expect((await handler(request())).status).toBe(outcome === 'transport' ? 500 : 200);
    if (outcome === 'invalid')
      expect(rpcCalls('invalidate_expo_push_tokens')).toEqual([
        { p_tokens: ['ExponentPushToken[synthetic]'] },
      ]);
    if (outcome !== 'transport')
      expect(rpcCalls('advance_doji_push_fanout_shard')[0].p_accepted_count).toBe(0);
  },
);
test.each(['invalidate_native_push_tokens', 'invalidate_expo_push_tokens'])(
  'failure persisting %s prevents page advancement',
  async (failed) => {
    recipients = [recipient('a', [endpoint('apns')]), recipient('e')];
    mockApns.mockResolvedValue({ outcome: 'invalid_token' });
    mockExpo.mockResolvedValue({
      httpOk: true,
      invalidTokenIndices: [0],
      tickets: [{ status: 'error' }],
    });
    mockRpc.mockImplementation(async (name, args) =>
      name === failed ? { error: 'synthetic' } : database(name, args),
    );
    expect((await handler(request())).status).toBe(500);
    expect(rpcCalls('advance_doji_push_fanout_shard')).toHaveLength(0);
  },
);
