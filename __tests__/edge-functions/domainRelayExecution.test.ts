import type { DeliveryEvent } from '../../supabase/functions/_shared/domain-event-delivery';
jest.mock('https://esm.sh/@supabase/supabase-js@2', () => ({ createClient: () => mockDatabase }), {
  virtual: true,
});
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
const mockApns = jest.fn();
const mockFcm = jest.fn();
const mockExpo = jest.fn();
let mockProviders = { apns: true, fcm: true };
const rpc = jest.fn();
const from = jest.fn();
const getUserById = jest.fn();
const upsert = jest.fn();
const mockDatabase = { rpc, from, auth: { admin: { getUserById } } };
const transport = jest.fn();
const originalFetch = global.fetch;
const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Deno');
const id = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
type Event = DeliveryEvent & { topic: string; lease_id: string };
type Endpoint = {
  token: string;
  provider: string;
  installationId: string;
  notificationContractVersion?: number;
  environment?: string;
};
type Profile = {
  user_id: string;
  notification_token: string | null;
  native_endpoints: Endpoint[] | null;
  notification_preferences: Record<string, unknown> | null;
};
let events: Event[];
let profiles: Profile[];
let tables: Record<string, { data?: unknown; error?: { message: string } }>;
let settings: Record<string, string | undefined>;
let handler: (request: Request) => Promise<Response>;
const event = (type = 'post.updated', payload: Record<string, unknown> = {}): Event => ({
  id,
  event_type: type,
  aggregate_id: id,
  topic: 'feed:public',
  lease_id: 'synthetic-lease',
  payload,
  created_at: new Date().toISOString(),
  available_at: new Date().toISOString(),
});
const targeted = (payload: Record<string, unknown> = {}) =>
  event('notification.friend_request.created', {
    sendPush: true,
    targetUserId: userId,
    friendshipId: id,
    ...payload,
  });
const endpoint = (provider: string, version?: number): Endpoint => ({
  token: `${provider}-token`,
  provider,
  installationId: `${provider}-installation`,
  notificationContractVersion: version,
});
const profile = (native: Endpoint[] | null = []): Profile => ({
  user_id: userId,
  notification_token: 'ExponentPushToken[synthetic]',
  notification_preferences: null,
  native_endpoints: native,
});
const request = (secret = 'synthetic') =>
  new Request('https://synthetic.invalid', {
    method: 'POST',
    headers: { 'x-outbox-secret': secret },
  });
const calls = (name: string) => rpc.mock.calls.filter(([n]) => name === n).map(([, args]) => args);
function database(name: string, args: Record<string, unknown> = {}) {
  if (name === 'claim_domain_events_v2') return { data: events };
  if (name === 'get_push_recipients') return { data: profiles };
  if (name === 'mark_domain_events_realtime_published' || name === 'complete_domain_events_batch')
    return { data: (args.p_events as unknown[]).length };
  if (name === 'next_domain_event_available_at') return { data: null };
  if (name === 'get_friend_fanout_realtime_topics')
    return { data: [{ topic: `user:${userId}:events` }] };
  if (name === 'claim_push_delivery_targets_batch_v2')
    return {
      data: (args.p_targets as { userId: string; endpointKey: string }[]).map((t) => ({
        delivery_key: `delivery:${t.endpointKey}`,
        target_user_id: t.userId,
        endpoint_key: t.endpointKey,
      })),
    };
  if (name === 'get_moderation_push_recipient') return { data: [profile()] };
  if (name === 'get_doji_push_recipients_page') return { data: [] };
  return { data: true, error: null };
}
beforeEach(() => {
  events = [event()];
  profiles = [profile()];
  mockProviders = { apns: true, fcm: true };
  settings = {
    SUPABASE_URL: 'https://database.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic',
    OUTBOX_RELAY_SECRET: 'synthetic',
    ABLY_API_KEY: 'synthetic:key',
    RESEND_API_KEY: 'synthetic-mail',
    MEMBER_FROM_EMAIL: 'synthetic@example.invalid',
  };
  tables = {
    moderation_decisions: {
      data: {
        id,
        affected_user_id: userId,
        action: 'remove_content',
        severity: 'level_2',
        policy_code: 'synthetic_policy',
        appeal_eligible: true,
        decided_at: new Date().toISOString(),
        state: 'active',
      },
    },
    moderation_account_actions: {
      data: {
        action: 'temporary_restriction',
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 10000).toISOString(),
      },
    },
    moderation_notices: { data: { title: 'Synthetic notice', body: 'Synthetic details' } },
    member_moderation_email_deliveries: { data: null },
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
  rpc.mockReset().mockImplementation(async (name, args) => database(name, args));
  upsert.mockReset().mockResolvedValue({ error: null });
  from.mockReset().mockImplementation((table) => {
    const q = {
      select: jest.fn(),
      eq: jest.fn(),
      maybeSingle: jest.fn(async () => tables[table] ?? { data: null }),
      upsert,
    };
    q.select.mockReturnValue(q);
    q.eq.mockReturnValue(q);
    return q;
  });
  getUserById.mockReset().mockResolvedValue({
    data: {
      user: { email_confirmed_at: new Date().toISOString(), email: 'member@example.invalid' },
    },
    error: null,
  });
  mockApns.mockReset().mockResolvedValue({ outcome: 'accepted', providerId: 'apns-ticket' });
  mockFcm.mockReset().mockResolvedValue({ outcome: 'accepted', providerId: 'fcm-ticket' });
  mockExpo.mockReset().mockImplementation(async (messages: unknown[]) => ({
    httpOk: true,
    invalidTokenIndices: [],
    tickets: messages.map(() => ({ status: 'ok', id: 'expo-ticket' })),
  }));
  transport
    .mockReset()
    .mockImplementation(async (url: string) =>
      Response.json(url.includes('resend.com') ? { id: 'synthetic-email' } : { statusCode: 201 }),
    );
  global.fetch = transport;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.isolateModules(() => require('../../supabase/functions/relay-domain-events/index'));
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
  jest.useRealTimers();
});
afterAll(() => {
  if (descriptor) Object.defineProperty(globalThis, 'Deno', descriptor);
  else Reflect.deleteProperty(globalThis, 'Deno');
});

describe('ordered durable realtime publication', () => {
  test.each([undefined, ''])('requires configured relay secret', async (secret) => {
    settings.OUTBOX_RELAY_SECRET = secret;
    expect((await handler(request())).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  test('wrong caller rejected', async () => {
    expect((await handler(request('wrong'))).status).toBe(401);
  });
  test('missing provider key fails before claiming events', async () => {
    settings.ABLY_API_KEY = '';
    expect((await handler(request())).status).toBe(500);
    expect(rpc).not.toHaveBeenCalled();
  });
  test('claim failure does not publish', async () => {
    rpc.mockResolvedValue({ error: { message: 'synthetic' } });
    expect((await handler(request())).status).toBe(500);
    expect(transport).not.toHaveBeenCalled();
  });
  test('null event batch is idle', async () => {
    rpc.mockImplementation(async (name, args) =>
      name === 'claim_domain_events_v2' ? { data: null } : database(name, args),
    );
    expect(await (await handler(request())).json()).toMatchObject({
      examined: 0,
      published: 0,
      failed: 0,
      hasMore: false,
    });
    expect(transport).not.toHaveBeenCalled();
  });
  test('publishes identifiers then records publication before bulk completion', async () => {
    const result = await (await handler(request())).json();
    expect(result).toMatchObject({ examined: 1, published: 1, failed: 0 });
    const [url, init] = transport.mock.calls[0];
    expect(url).toBe('https://rest.ably.io/channels/feed%3Apublic/messages');
    expect(JSON.parse(init.body)).toEqual([
      {
        name: 'post.updated',
        data: { eventId: id, aggregateId: id, occurredAt: events[0].created_at },
      },
    ]);
    expect(calls('mark_domain_events_realtime_published')).toEqual([
      { p_events: [{ id, leaseId: 'synthetic-lease' }] },
    ]);
    expect(events[0].payload.realtimePublished).toBe(true);
    expect(calls('complete_domain_events_batch')).toHaveLength(1);
    expect(mockExpo).not.toHaveBeenCalled();
  });
  test('replay of published events does not republish', async () => {
    events[0].payload.realtimePublished = true;
    expect((await handler(request())).status).toBe(200);
    expect(transport).not.toHaveBeenCalled();
    expect(calls('mark_domain_events_realtime_published')).toHaveLength(0);
  });
  test('splits same-topic batches at25 and preserves event order', async () => {
    events = Array.from({ length: 100 }, (_, i) => ({ ...event(), id: `event-${i}` }));
    expect(await (await handler(request())).json()).toMatchObject({
      published: 100,
      hasMore: true,
    });
    expect(transport).toHaveBeenCalledTimes(4);
    expect(
      transport.mock.calls.flatMap(([, init]) =>
        JSON.parse(init.body).map((m: { data: { eventId: string } }) => m.data.eventId),
      ),
    ).toEqual(events.map((e) => e.id));
  });
  test.each(['http', 'transport', 'non-error', 'mark-error', 'mark-count'])(
    'publication %s failure releases rather than acknowledging',
    async (failure) => {
      if (failure === 'http')
        transport.mockResolvedValue(new Response('provider', { status: 503 }));
      if (failure === 'transport') transport.mockRejectedValue(new Error('transport'));
      if (failure === 'non-error') transport.mockRejectedValue('transport');
      if (failure.startsWith('mark'))
        rpc.mockImplementation(async (name, args) =>
          name === 'mark_domain_events_realtime_published'
            ? failure === 'mark-error'
              ? { error: { message: 'mark' } }
              : { data: 0 }
            : database(name, args),
        );
      const response = await handler(request());
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ failed: 1, published: 0 });
      expect(calls('release_domain_event')).toHaveLength(1);
      expect(calls('complete_domain_events_batch')).toHaveLength(0);
    },
  );
  test.each(['error', 'partial', 'null'])(
    'bulk completion %s releases unacknowledged leases',
    async (failure) => {
      events = [event(), { ...event(), id: 'second' }];
      rpc.mockImplementation(async (name, args) =>
        name === 'complete_domain_events_batch'
          ? failure === 'error'
            ? { error: { message: 'synthetic' } }
            : { data: failure === 'partial' ? 1 : null }
          : database(name, args),
      );
      const res = await handler(request());
      expect(res.status).toBe(503);
      expect(calls('release_domain_events_batch')[0].p_events).toHaveLength(2);
    },
  );
  test.each(['PGRST202', 'OTHER', 'success'])(
    'next wake %s preserves recoverability',
    async (mode) => {
      rpc.mockImplementation(async (name, args) =>
        name === 'next_domain_event_available_at'
          ? mode === 'success'
            ? { data: '2026-10-02T01:00:00Z' }
            : { error: { code: mode, message: 'synthetic' } }
          : database(name, args),
      );
      const res = await handler(request());
      expect(res.status).toBe(mode === 'OTHER' ? 500 : 200);
      if (mode === 'success')
        expect(await res.json()).toMatchObject({ nextWakeAt: '2026-10-02T01:00:00Z' });
    },
  );
  test('business relay stays gated and never reads member push profiles', async () => {
    events = [
      {
        ...event('business.profile.updated', { businessUserId: userId }),
        topic: `business:${userId}:events`,
      },
    ];
    expect((await handler(request())).status).toBe(503);
    expect(calls('get_push_recipients')).toHaveLength(0);
    expect(transport).not.toHaveBeenCalled();
  });
});

describe('friend-scoped fanout', () => {
  test.each([
    ['fanout.post_membership', 'post.created'],
    ['fanout.friend_completion', 'notification.friend_activity.updated'],
    ['fanout.community_reaction', 'notification.reaction.updated'],
    ['fanout.profile_presentation', 'profile.presentation.updated'],
    ['fanout.profile_stats', 'profile.stats.updated'],
    ['fanout.badge', 'badge.updated'],
  ])('maps %s to scoped %s invalidation', async (type, expected) => {
    events = [
      {
        ...event(type, { occurredAt: '2026-10-02T00:00:00Z', postId: id }),
        topic: 'internal:friend-fanout',
      },
    ];
    expect((await handler(request())).status).toBe(200);
    expect(transport.mock.calls[0][0]).toBe('https://main.realtime.ably.net/messages');
    expect(JSON.parse(transport.mock.calls[0][1].body)).toMatchObject({
      channels: [`user:${userId}:events`],
      messages: { name: expected, data: { occurredAt: '2026-10-02T00:00:00Z', eventId: id } },
    });
    expect(calls('process_friend_fanout_event')).toHaveLength(1);
  });
  test.each(['unknown', 'empty'])('does not publish %s fanout targets', async (kind) => {
    events = [
      {
        ...event(kind === 'unknown' ? 'fanout.unknown' : 'fanout.badge', { realtimeOnly: true }),
        topic: 'internal:friend-fanout',
      },
    ];
    if (kind === 'empty')
      rpc.mockImplementation(async (name, args) =>
        name === 'get_friend_fanout_realtime_topics' ? { data: null } : database(name, args),
      );
    expect((await handler(request())).status).toBe(200);
    expect(transport).not.toHaveBeenCalled();
    expect(calls('process_friend_fanout_event')).toHaveLength(0);
  });
  test('chunks recipient channels at100', async () => {
    events = [{ ...event('fanout.badge'), topic: 'internal:friend-fanout' }];
    rpc.mockImplementation(async (name, args) =>
      name === 'get_friend_fanout_realtime_topics'
        ? { data: Array.from({ length: 201 }, (_, i) => ({ topic: `user:${i}:events` })) }
        : database(name, args),
    );
    expect((await handler(request())).status).toBe(200);
    expect(transport.mock.calls.map(([, init]) => JSON.parse(init.body).channels.length)).toEqual([
      100, 100, 1,
    ]);
  });
  test.each([
    'targets',
    'expansion',
    'http',
    'nested-status',
    'nested-error',
    'network',
    'non-error',
  ])('fanout %s failure releases exact event lease', async (failure) => {
    events = [{ ...event('fanout.badge'), topic: 'internal:friend-fanout' }];
    if (['targets', 'expansion'].includes(failure))
      rpc.mockImplementation(async (name, args) =>
        name ===
        (failure === 'targets'
          ? 'get_friend_fanout_realtime_topics'
          : 'process_friend_fanout_event')
          ? { error: { message: 'synthetic' } }
          : database(name, args),
      );
    if (failure === 'http') transport.mockResolvedValue(Response.json({}, { status: 503 }));
    if (failure === 'nested-status')
      transport.mockResolvedValue(Response.json([{ channel: { statusCode: 500 } }]));
    if (failure === 'nested-error')
      transport.mockResolvedValue(Response.json({ channel: { error: { code: 1 } } }));
    if (failure === 'network') transport.mockRejectedValue(new Error('network'));
    if (failure === 'non-error') transport.mockRejectedValue('network');
    expect((await handler(request())).status).toBe(503);
    expect(calls('release_domain_event')).toHaveLength(1);
    expect(calls('complete_domain_events_batch')).toHaveLength(0);
  });
  test('successful opaque batch response is handled without parsing assumptions', async () => {
    events = [{ ...event('fanout.badge'), topic: 'internal:friend-fanout' }];
    transport.mockResolvedValue(new Response(''));
    expect((await handler(request())).status).toBe(200);
  });
});

describe('targeted OS delivery independent of realtime publication', () => {
  beforeEach(() => {
    events = [targeted()];
  });
  test('publishes realtime before using push profiles, with minimal notification data', async () => {
    events[0].payload = {
      ...events[0].payload,
      title: 'Synthetic title',
      body: 'Synthetic body',
      dailyEventId: id,
      postId: id,
      commentId: id,
      voteId: id,
      url: '/synthetic',
      type: 'CUSTOM',
    };
    expect((await handler(request())).status).toBe(200);
    expect(mockExpo.mock.calls[0][0][0]).toMatchObject({
      title: 'Synthetic title',
      body: 'Synthetic body',
      channelId: 'doji-alerts',
      data: {
        type: 'CUSTOM',
        daily_event_id: id,
        postId: id,
        commentId: id,
        voteId: id,
        url: '/synthetic',
        notificationScopeKind: 'friendship',
      },
    });
    expect(calls('claim_push_delivery_targets_batch_v2')[0]).toMatchObject({
      p_targets: [{ userId, endpointKey: 'expo' }],
      p_scope_kind: 'friendship',
      p_scope_id: id,
    });
  });
  test('empty copy falls back to safe generic text', async () => {
    expect((await handler(request())).status).toBe(200);
    expect(mockExpo.mock.calls[0][0][0]).toMatchObject({
      title: 'Doji',
      body: '',
      data: { type: 'ACTIVITY', postId: '', url: '' },
    });
  });
  test.each(['absent', 'null', 'no-token', 'preference'])(
    'skips targeted send when %s',
    async (kind) => {
      if (kind === 'absent') profiles = [];
      if (kind === 'null')
        rpc.mockImplementation(async (name, args) =>
          name === 'get_push_recipients' ? { data: null } : database(name, args),
        );
      if (kind === 'no-token') profiles[0].notification_token = null;
      if (kind === 'preference') profiles[0].notification_preferences = { friend_requests: false };
      expect((await handler(request())).status).toBe(200);
      expect(mockExpo).not.toHaveBeenCalled();
      expect(calls('complete_domain_event')).toHaveLength(1);
    },
  );
  test('profile read failure does not hold up realtime publication but leaves push retryable', async () => {
    rpc.mockImplementation(async (name, args) =>
      name === 'get_push_recipients' ? { error: { message: 'profile' } } : database(name, args),
    );
    expect((await handler(request())).status).toBe(503);
    expect(calls('mark_domain_events_realtime_published')).toHaveLength(1);
    expect(mockExpo).not.toHaveBeenCalled();
  });
  test.each(['apns', 'fcm'])(
    'native %s receives scope and suppresses Expo duplicate',
    async (provider) => {
      profiles = [profile([endpoint(provider, 2)])];
      expect((await handler(request())).status).toBe(200);
      expect(mockExpo).not.toHaveBeenCalled();
      if (provider === 'apns')
        expect(mockApns.mock.calls[0][1]).toMatchObject({
          environment: 'production',
          collapseId: `friend-request:${id}`,
        });
      else
        expect(mockFcm.mock.calls[0][0]).toMatchObject({
          channelId: 'direct-activity',
          collapseKey: `friend-request:${id}`,
        });
    },
  );
  test.each([1, undefined])('legacy FCM contract %s uses legacy channel', async (version) => {
    profiles = [profile([endpoint('fcm', version)])];
    expect((await handler(request())).status).toBe(200);
    expect(mockFcm.mock.calls[0][0].channelId).toBe('doji-alerts');
  });
  test('unsupported or empty native endpoints use correct Expo channel', async () => {
    mockProviders = { apns: false, fcm: false };
    profiles = [
      profile([endpoint('apns', 2), endpoint('fcm'), { ...endpoint('unknown'), token: '' }]),
    ];
    expect((await handler(request())).status).toBe(200);
    expect(mockExpo.mock.calls[0][0][0].channelId).toBe('direct-activity');
  });
  test('malformed native list falls back to Expo', async () => {
    profiles[0].native_endpoints = null;
    expect((await handler(request())).status).toBe(200);
    expect(mockExpo).toHaveBeenCalledTimes(1);
  });
  test.each(['invalid_token', 'transport_error', 'rejected'])(
    'native %s recorded before completion/recovery',
    async (outcome) => {
      profiles = [profile([endpoint('apns'), endpoint('fcm')])];
      mockApns.mockResolvedValue({ outcome });
      mockFcm.mockResolvedValue({ outcome });
      expect((await handler(request())).status).toBe(outcome === 'transport_error' ? 503 : 200);
      if (outcome === 'invalid_token')
        expect(calls('invalidate_native_push_tokens')).toEqual([
          { p_tokens: ['apns-token', 'fcm-token'] },
        ]);
      expect(calls('record_push_delivery_results')).toHaveLength(1);
    },
  );
  test.each(['invalid', 'rejected', 'transport', 'missing'])(
    'Expo %s is not an accepted handoff',
    async (kind) => {
      mockExpo.mockResolvedValue({
        httpOk: kind !== 'transport',
        invalidTokenIndices: kind === 'invalid' ? [0] : [],
        tickets: kind === 'missing' ? [] : [{ status: 'error', message: 'synthetic' }],
        transportError: 'synthetic',
      });
      expect((await handler(request())).status).toBe(kind === 'transport' ? 503 : 200);
      if (kind === 'invalid')
        expect(calls('invalidate_expo_push_token')[0]).toEqual({
          p_user_id: userId,
          p_token: 'ExponentPushToken[synthetic]',
        });
    },
  );
  test.each(['error', 'none', 'partial'])(
    'endpoint claim %s does not accidentally resend',
    async (kind) => {
      profiles = [profile([endpoint('apns'), endpoint('fcm')])];
      rpc.mockImplementation(async (name, args) =>
        name === 'claim_push_delivery_targets_batch_v2'
          ? kind === 'error'
            ? { error: 'claim' }
            : {
                data:
                  kind === 'none'
                    ? null
                    : [
                        {
                          endpoint_key: 'native:apns-installation',
                          delivery_key: 'one',
                          target_user_id: userId,
                        },
                      ],
              }
          : database(name, args),
      );
      expect((await handler(request())).status).toBe(kind === 'error' ? 503 : 200);
      expect(mockFcm).not.toHaveBeenCalled();
      expect(mockApns).toHaveBeenCalledTimes(kind === 'partial' ? 1 : 0);
    },
  );
  test.each(['normal', 'stale', 'no-claim'])(
    'lost completion lease in %s path releases event',
    async (kind) => {
      if (kind === 'stale') events[0].created_at = new Date(Date.now() - 600000).toISOString();
      rpc.mockImplementation(async (name, args) =>
        name === 'complete_domain_event'
          ? { data: false }
          : kind === 'no-claim' && name === 'claim_push_delivery_targets_batch_v2'
            ? { data: [] }
            : database(name, args),
      );
      expect((await handler(request())).status).toBe(503);
      expect(calls('release_domain_event')[0].p_error).toBe('Event lease was lost');
    },
  );
  test('stale push completes without a late phone alert', async () => {
    events[0].created_at = new Date(Date.now() - 600000).toISOString();
    expect((await handler(request())).status).toBe(200);
    expect(mockExpo).not.toHaveBeenCalled();
  });
  test('broadcast is routed through real paged helper', async () => {
    events = [event('doji.activated', { broadcastPush: true, dailyEventId: id })];
    expect(await (await handler(request())).json()).toMatchObject({
      published: 1,
      broadcastSent: 0,
    });
    expect(calls('get_doji_push_recipients_page')).toHaveLength(1);
  });
  test('broadcast continuation is not prematurely completed', async () => {
    events = [event('doji.activated', { broadcastPush: true, dailyEventId: id })];
    rpc.mockImplementation(async (name, args) =>
      name === 'get_doji_push_recipients_page'
        ? {
            data: Array.from({ length: 1000 }, (_, i) => ({
              user_id: `user${i}`,
              notification_token: 'synthetic',
            })),
          }
        : name === 'claim_push_delivery_targets_batch_v2'
          ? { data: [] }
          : database(name, args),
    );
    expect(await (await handler(request())).json()).toMatchObject({
      continued: 1,
      hasMore: true,
      published: 0,
    });
    expect(calls('complete_domain_event')).toHaveLength(0);
  });
});

describe('private moderation notice delivery', () => {
  beforeEach(() => {
    events = [
      event('moderation.status.changed', {
        decisionId: id,
        targetUserId: userId,
        sendPush: true,
        sendEmail: true,
      }),
    ];
  });
  test.each([
    'moderation_decisions',
    'moderation_account_actions',
    'moderation_notices',
    'member_moderation_email_deliveries',
  ])('failed %s read is not ignored', async (table) => {
    tables[table] = { error: { message: 'synthetic' } };
    expect((await handler(request())).status).toBe(503);
    expect(calls('release_domain_event')).toHaveLength(1);
  });
  test.each([
    null,
    { state: 'reversed' },
    { state: 'active', action: 'unknown' },
    { state: 'active', action: 'remove_content', severity: 'unknown' },
  ])('requires finalized active removal %j', async (data) => {
    tables.moderation_decisions = { data };
    expect((await handler(request())).status).toBe(503);
    expect(mockExpo).not.toHaveBeenCalled();
  });
  test.each([null, { action: 'other' }])('requires persisted account outcome %j', async (data) => {
    tables.moderation_account_actions = { data };
    expect((await handler(request())).status).toBe(503);
  });
  test.each([null, { title: 'Title' }, { body: 'Body' }])(
    'requires full private notice %j',
    async (data) => {
      tables.moderation_notices = { data };
      expect((await handler(request())).status).toBe(503);
    },
  );
  test('missing decision identifier is rejected even if push policy has target scope', async () => {
    // A whitespace ID resolves no push policy and is not eligible for delivery.
    events[0].aggregate_id = null;
    events[0].payload.decisionId = '';
    expect((await handler(request())).status).toBe(200);
    expect(from).not.toHaveBeenCalled();
  });
  test.each(['warning', 'temporary_restriction', 'permanent_ban'])(
    'renders persisted %s outcome without reporter or evidence',
    async (action) => {
      tables.moderation_account_actions = {
        data: {
          action,
          starts_at: new Date().toISOString(),
          ends_at: action === 'temporary_restriction' ? new Date().toISOString() : null,
        },
      };
      tables.moderation_decisions = {
        data: {
          ...(tables.moderation_decisions.data as object),
          action: action === 'warning' ? 'remove_profile_photo' : 'remove_content',
          appeal_eligible: action !== 'permanent_ban',
        },
      };
      expect((await handler(request())).status).toBe(200);
      const sent = transport.mock.calls.find(([url]) => url.includes('resend.com'))!;
      const payload = JSON.parse(sent[1].body);
      expect(payload.to).toEqual(['member@example.invalid']);
      expect(payload.html).toContain('Synthetic notice');
      expect(payload.html).not.toContain('reporter@example.invalid');
      expect(sent[1].headers['Idempotency-Key']).toBe(`moderation-decision/${id}`);
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'sent',
          provider_id: 'synthetic-email',
          user_id: userId,
        }),
        { onConflict: 'decision_id' },
      );
    },
  );
  test('low severity cannot trigger serious-removal email', async () => {
    tables.moderation_decisions = {
      data: { ...(tables.moderation_decisions.data as object), severity: 'level_1' },
    };
    expect((await handler(request())).status).toBe(503);
    expect(transport.mock.calls.some(([url]) => url.includes('resend.com'))).toBe(false);
  });
  test.each(['sent', 'skipped'])('existing terminal email %s is not resent', async (status) => {
    tables.member_moderation_email_deliveries = { data: { status } };
    expect((await handler(request())).status).toBe(200);
    expect(getUserById).not.toHaveBeenCalled();
  });
  test.each([
    null,
    { email: 'unverified@example.invalid' },
    { email_confirmed_at: '2026-01-01', email: '' },
  ])('unverified/missing recipient %j is recorded skipped', async (user) => {
    getUserById.mockResolvedValue({ data: { user }, error: null });
    expect((await handler(request())).status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped' }), {
      onConflict: 'decision_id',
    });
  });
  test('recipient auth lookup failure remains retryable', async () => {
    getUserById.mockResolvedValue({ error: { message: 'auth' } });
    expect((await handler(request())).status).toBe(503);
  });
  test.each(['skip', 'sent'])(
    'receipt %s write failure cannot falsely complete event',
    async (mode) => {
      if (mode === 'skip') getUserById.mockResolvedValue({ data: { user: null } });
      upsert.mockResolvedValue({ error: { message: 'receipt' } });
      expect((await handler(request())).status).toBe(503);
    },
  );
  test.each(['key', 'sender'])('missing email %s blocks handoff', async (field) => {
    if (field === 'key') settings.RESEND_API_KEY = '';
    else settings.MEMBER_FROM_EMAIL = undefined;
    expect((await handler(request())).status).toBe(503);
  });
  test('configured legacy sender fallback works', async () => {
    settings.MEMBER_FROM_EMAIL = undefined;
    settings.ADMIN_FROM_EMAIL = 'legacy@example.invalid';
    expect((await handler(request())).status).toBe(200);
    expect(
      JSON.parse(transport.mock.calls.find(([url]) => url.includes('resend.com'))![1].body).from,
    ).toBe('legacy@example.invalid');
  });
  test.each(['http', 'missing-id', 'json'])(
    'provider email %s failure persists failed receipt',
    async (mode) => {
      transport.mockImplementation(async (url: string) =>
        !url.includes('resend.com')
          ? Response.json({})
          : mode === 'json'
            ? new Response('invalid')
            : Response.json({}, { status: mode === 'http' ? 503 : 200 }),
      );
      expect((await handler(request())).status).toBe(503);
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed', completed_at: null }),
        { onConflict: 'decision_id' },
      );
    },
  );
  test.each(['recipient', 'none', 'nonarray', 'error', 'legacy'])(
    'suspended-account fallback recipient %s is checked through dedicated RPC',
    async (mode) => {
      profiles = [];
      tables.moderation_account_actions = { data: { action: 'permanent_ban' } };
      events[0].payload.sendEmail = false;
      rpc.mockImplementation(async (name, args) =>
        name === 'get_moderation_push_recipient'
          ? mode === 'error'
            ? { error: { message: 'recipient' } }
            : {
                data:
                  mode === 'none'
                    ? []
                    : mode === 'nonarray'
                      ? {}
                      : [{ ...profile(), native_endpoints: mode === 'legacy' ? null : [] }],
              }
          : database(name, args),
      );
      expect((await handler(request())).status).toBe(mode === 'error' ? 503 : 200);
      expect(calls('get_moderation_push_recipient')).toEqual([{ p_user_id: userId }]);
      expect(mockExpo).toHaveBeenCalledTimes(['recipient', 'legacy'].includes(mode) ? 1 : 0);
    },
  );
  test('stale moderation push still delivers serious account email', async () => {
    events[0].created_at = new Date(Date.now() - 600000).toISOString();
    expect((await handler(request())).status).toBe(200);
    expect(mockExpo).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sent' }),
      expect.any(Object),
    );
  });
});
