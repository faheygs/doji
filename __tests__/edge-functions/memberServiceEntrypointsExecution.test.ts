import { webcrypto } from 'node:crypto';
jest.mock(
  'https://esm.sh/@supabase/supabase-js@2',
  () => ({ createClient: (...args: unknown[]) => mockCreateClient(...args) }),
  { virtual: true },
);
jest.mock(
  'npm:ably@2.26.0',
  () => ({
    Rest: jest.fn().mockImplementation(() => ({ auth: { createTokenRequest: mockTokenRequest } })),
  }),
  { virtual: true },
);
jest.mock('npm:@noble/hashes@1.8.0/sha256', () => jest.requireActual('@noble/hashes/sha256'), {
  virtual: true,
});
const mockCreateClient = jest.fn();
const mockTokenRequest = jest.fn();
const id = '11111111-1111-4111-8111-111111111111';
const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
const denoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Deno');
const originalFetch = global.fetch;
let handler: (request: Request) => Promise<Response>;
let settings: Record<string, string | undefined>;
const rpc = jest.fn();
const transport = jest.fn();
function load(name: string) {
  jest.isolateModules(() => require(`../../supabase/functions/${name}/index`));
}
function req(data: unknown = {}, method = 'POST', headers: Record<string, string> = {}) {
  return new Request('https://synthetic.invalid/edge', {
    method,
    headers: { authorization: 'Bearer synthetic', 'content-type': 'application/json', ...headers },
    ...(method === 'POST' ? { body: JSON.stringify(data) } : {}),
  });
}
beforeAll(() =>
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto }),
);
beforeEach(() => {
  settings = {
    SUPABASE_URL: 'https://database.invalid',
    SUPABASE_ANON_KEY: 'synthetic-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service',
    ABLY_API_KEY: 'synthetic:key',
    DOJI_ORCHESTRATOR_SECRET: 'synthetic',
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
  rpc.mockReset().mockResolvedValue({ data: { userId: id }, error: null });
  mockCreateClient.mockReset().mockReturnValue({ rpc });
  mockTokenRequest.mockReset().mockResolvedValue({ keyName: 'synthetic', nonce: 'synthetic' });
  transport.mockReset().mockResolvedValue(new Response(null));
  global.fetch = transport;
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
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

describe('member realtime token entrypoint', () => {
  beforeEach(() => load('realtime-token'));
  test('missing authorization never queries capabilities', async () => {
    expect((await handler(new Request('https://synthetic.invalid'))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  test('missing provider configuration cannot issue tokens', async () => {
    settings.ABLY_API_KEY = '';
    expect((await handler(req())).status).toBe(500);
    expect(rpc).not.toHaveBeenCalled();
  });
  test.each(['header', 'stream'])('rejects excessive request bytes by %s', async (mode) => {
    expect(
      (
        await handler(
          req(
            { padding: 'x'.repeat(17000) },
            'POST',
            mode === 'header' ? { 'content-length': '17000' } : {},
          ),
        )
      ).status,
    ).toBe(413);
    expect(rpc).not.toHaveBeenCalled();
  });
  test('malformed JSON returns400', async () => {
    expect(
      (
        await handler(
          new Request('https://synthetic.invalid', {
            method: 'POST',
            headers: { authorization: 'Bearer synthetic' },
            body: '{',
          }),
        )
      ).status,
    ).toBe(400);
  });
  test.each([null, [], 1, 'text'])(
    'nonobject JSON defaults to minimal member scope %j',
    async (value) => {
      expect((await handler(req(value))).status).toBe(200);
      expect(rpc).toHaveBeenCalledWith('get_realtime_token_capabilities', { p_post_ids: [] });
    },
  );
  test.each(['none', 'empty', 'whitespace', 'get'])('handles %s request body', async (mode) => {
    const r = new Request('https://synthetic.invalid', {
      method: mode === 'get' ? 'GET' : 'POST',
      headers: { authorization: 'Bearer synthetic' },
      ...(mode === 'empty' ? { body: '' } : mode === 'whitespace' ? { body: '  ' } : {}),
    });
    expect((await handler(r)).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('get_realtime_token_capabilities', { p_post_ids: [] });
  });
  test('deduplicates valid post IDs and uses database-authorized capabilities only', async () => {
    const other = '22222222-2222-4222-8222-222222222222';
    rpc.mockResolvedValue({ data: { userId: id, authorizedPostIds: [other, 42] } });
    expect((await handler(req({ postIds: [id, id, other, 'bad', 42, null] }))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('get_realtime_token_capabilities', {
      p_post_ids: [id, other],
    });
    const token = mockTokenRequest.mock.calls[0][0];
    expect(token).toMatchObject({ clientId: id, ttl: 900000 });
    expect(JSON.parse(token.capability)).toEqual({
      'doji:global': ['subscribe'],
      'feed:public': ['subscribe'],
      'leaderboard:global': ['subscribe'],
      [`user:${id}:events`]: ['subscribe'],
      [`post:${other}`]: ['subscribe'],
    });
  });
  test('caps unique post subscriptions', async () => {
    const postIds = Array.from(
      { length: 65 },
      (_, i) => `${i.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`,
    );
    expect((await handler(req({ postIds }))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  test('admin request cannot mix member post subscriptions', async () => {
    expect((await handler(req({ admin: true, postIds: [id] }))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  test('employee capability request remains narrowly scoped', async () => {
    rpc.mockResolvedValue({ data: { userId: id, isAdmin: true } });
    expect((await handler(req({ admin: true }))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('get_admin_realtime_token_capabilities', {});
    expect(JSON.parse(mockTokenRequest.mock.calls[0][0].capability)).toEqual({
      'doji:global': ['subscribe'],
      'moderation:global': ['subscribe'],
    });
  });
  test.each([{ data: null }, { data: { userId: id }, error: { message: 'failure' } }])(
    'capability failure returns retryable503 %j',
    async (value) => {
      rpc.mockResolvedValue(value);
      const response = await handler(req());
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        code: 'CAPABILITY_UNAVAILABLE',
        retryable: true,
      });
      expect(mockTokenRequest).not.toHaveBeenCalled();
    },
  );
  test.each([new Error('timeout'), 'network'])(
    'capability transport failure is bounded %s',
    async (error) => {
      rpc.mockRejectedValue(error);
      const response = await handler(req({ admin: true }));
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ code: 'CAPABILITY_TIMEOUT' });
    },
  );
  test.each([{}, { userId: 1 }, { userId: '' }])(
    'missing member identity rejects %j',
    async (data) => {
      rpc.mockResolvedValue({ data });
      expect((await handler(req())).status).toBe(401);
    },
  );
  test.each([new Error('provider'), 'provider'])(
    'provider rejection gives retryable failure %s',
    async (error) => {
      mockTokenRequest.mockRejectedValue(error);
      const response = await handler(req());
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        code: 'PROVIDER_UNAVAILABLE',
        retryable: true,
      });
    },
  );
  test('provider signing timeout is bounded at8seconds', async () => {
    jest.useFakeTimers();
    mockTokenRequest.mockImplementation(() => new Promise(() => {}));
    const pending = handler(req({ admin: true }));
    await jest.advanceTimersByTimeAsync(8001);
    expect((await pending).status).toBe(503);
    expect(jest.getTimerCount()).toBe(0);
  });
  test('database fetch wrapper preserves supplied cancellation and otherwise adds timeout', async () => {
    await handler(req());
    const fetcher = mockCreateClient.mock.calls[0][2].global.fetch;
    await fetcher('https://database.invalid/read');
    expect(transport.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    const c = new AbortController();
    await fetcher('https://database.invalid/read', { signal: c.signal });
    expect(transport.mock.calls[1][1].signal).toBe(c.signal);
  });
});

describe('one-shot event transition entrypoint', () => {
  beforeEach(() => load('orchestrate-doji'));
  test.each([undefined, ''])('missing configured secret rejects', async (secret) => {
    settings.DOJI_ORCHESTRATOR_SECRET = secret;
    expect((await handler(req({}, 'POST', { 'x-orchestrator-secret': 'synthetic' }))).status).toBe(
      401,
    );
  });
  test('incorrect caller secret rejects', async () => {
    expect((await handler(req())).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  test.each([
    {},
    { action: 'wrong', dailyEventId: id },
    { action: 'close' },
    { action: 'close', dailyEventId: 'wrong' },
  ])('rejects invalid event command %j', async (data) => {
    expect(
      (await handler(req(data, 'POST', { 'x-orchestrator-secret': 'synthetic' }))).status,
    ).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  test.each([
    ['prelive', 'begin_daily_event_prelive'],
    ['activate', 'activate_daily_event'],
    ['close', 'close_daily_event'],
    ['close_targeted', 'close_targeted_daily_event'],
  ])('maps %s to exact atomic %s command', async (action, name) => {
    rpc.mockResolvedValue({ data: { status: 'synthetic' } });
    expect(
      await (
        await handler(
          req({ action, dailyEventId: id }, 'POST', { 'x-orchestrator-secret': 'synthetic' }),
        )
      ).json(),
    ).toEqual({ status: 'synthetic' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(name, { p_daily_event_id: id });
  });
  test('database failure is not acknowledged', async () => {
    rpc.mockResolvedValue({ error: { message: 'synthetic-failure' } });
    expect(
      (
        await handler(
          req({ action: 'close', dailyEventId: id }, 'POST', {
            'x-orchestrator-secret': 'synthetic',
          }),
        )
      ).status,
    ).toBe(500);
  });
});

describe('bounded operational health entrypoint', () => {
  beforeEach(() => load('operational-health'));
  test.each([undefined, ''])('missing secret rejects', async (secret) => {
    settings.OUTBOX_RELAY_SECRET = secret;
    expect((await handler(req({}, 'POST', { 'x-outbox-secret': 'synthetic' }))).status).toBe(401);
  });
  test('wrong caller is rejected without queries', async () => {
    expect((await handler(req())).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  test.each([
    'get_operational_health',
    'get_repairable_doji_alarms',
    'refresh_daily_event_health_snapshots_v1',
  ])('propagates failed %s check', async (name) => {
    rpc.mockImplementation(async (call) =>
      call === name ? { error: { message: 'synthetic' } } : { data: {} },
    );
    expect((await handler(req({}, 'POST', { 'x-outbox-secret': 'synthetic' }))).status).toBe(500);
  });
  test.each([null, 'invalid', { healthy: true }])(
    'projects health snapshot with explicit empty fallbacks %j',
    async (health) => {
      rpc.mockImplementation(async (name) => ({
        data: name === 'get_operational_health' ? health : null,
      }));
      const res = await handler(req({}, 'POST', { 'x-outbox-secret': 'synthetic' }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        ...(typeof health === 'object' && health
          ? health
          : { healthy: false, error: 'No health snapshot returned' }),
        alarm_repairs: [],
        event_health_snapshots_refreshed: 0,
      });
      expect(rpc).toHaveBeenCalledWith('get_repairable_doji_alarms', { p_limit: 20 });
      expect(rpc).toHaveBeenCalledWith('refresh_daily_event_health_snapshots_v1', { p_limit: 5 });
    },
  );
  test('preserves repair and snapshot counts', async () => {
    rpc.mockImplementation(async (name) => ({
      data:
        name === 'get_operational_health'
          ? { healthy: true }
          : name === 'get_repairable_doji_alarms'
            ? [{ id }]
            : 3,
    }));
    expect(
      await (await handler(req({}, 'POST', { 'x-outbox-secret': 'synthetic' }))).json(),
    ).toEqual({ healthy: true, alarm_repairs: [{ id }], event_health_snapshots_refreshed: 3 });
  });
});

describe('account deletion durable cleanup entrypoint', () => {
  const upsert = jest.fn();
  const deleteUser = jest.fn();
  const list = jest.fn();
  const remove = jest.fn();
  const update = jest.fn();
  const finish = jest.fn();
  const getUser = jest.fn();
  beforeEach(() => {
    upsert.mockReset().mockResolvedValue({ error: null });
    deleteUser.mockReset().mockResolvedValue({ error: null });
    list.mockReset().mockResolvedValue({ data: [] });
    remove.mockReset().mockResolvedValue({ error: null });
    update.mockReset().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
    finish.mockReset().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
    getUser.mockReset().mockResolvedValue({ data: { user: { id } }, error: null });
    mockCreateClient.mockReturnValue({
      auth: { getUser, admin: { deleteUser } },
      from: () => ({ upsert, update, delete: finish }),
      storage: { from: () => ({ list, remove }) },
    });
    load('delete-account');
  });
  test.each([
    ['OPTIONS', 200],
    ['GET', 405],
  ])('method %s is handled without mutation', async (method, status) => {
    expect((await handler(req({}, method as string))).status).toBe(status);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });
  test.each(['', 'Basic synthetic'])(
    'missing Bearer authorization rejects %s',
    async (authorization) => {
      expect((await handler(req({}, 'POST', { authorization }))).status).toBe(401);
    },
  );
  test.each(['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'])(
    'missing %s fails before auth',
    async (key) => {
      settings[key] = '';
      expect((await handler(req())).status).toBe(500);
      expect(getUser).not.toHaveBeenCalled();
    },
  );
  test.each([
    { data: { user: null }, error: null },
    { data: { user: { id } }, error: { message: 'auth' } },
  ])('unverified identity cannot delete account', async (value) => {
    getUser.mockResolvedValue(value);
    expect((await handler(req())).status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });
  test('persists cleanup intent before identity deletion and clears only after storage completes', async () => {
    const res = await handler(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, requestId: expect.any(String) });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: id, claim_token: null }),
      { onConflict: 'user_id' },
    );
    expect(deleteUser).toHaveBeenCalledWith(id, false);
    expect(upsert.mock.invocationCallOrder[0]).toBeLessThan(deleteUser.mock.invocationCallOrder[0]);
    expect(deleteUser.mock.invocationCallOrder[0]).toBeLessThan(finish.mock.invocationCallOrder[0]);
    expect(mockCreateClient.mock.calls[0][2]).toMatchObject({
      global: { headers: { Authorization: 'Bearer synthetic' } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });
  test.each(['intent', 'identity', 'non-error'])(
    'durable %s failure returns generic failure',
    async (phase) => {
      if (phase === 'intent') upsert.mockResolvedValue({ error: { message: 'private' } });
      else if (phase === 'identity')
        deleteUser.mockResolvedValue({ error: { message: 'private' } });
      else upsert.mockRejectedValue('private');
      const res = await handler(req());
      expect(res.status).toBe(500);
      expect(await res.text()).not.toContain('private');
      if (phase !== 'identity') expect(deleteUser).not.toHaveBeenCalled();
      expect(finish).not.toHaveBeenCalled();
    },
  );
  test('lists paginated nested folders and removes in bounded batches', async () => {
    list.mockImplementation(async (folder: string, options: { offset: number }) => ({
      data:
        folder === id && options.offset === 0
          ? Array.from({ length: 100 }, (_, i) => ({
              name: i === 0 ? 'nested' : `file-${i}`,
              id: i === 0 ? null : 'object',
            }))
          : folder.endsWith('/nested')
            ? [{ name: 'leaf', id: 'object' }]
            : folder === id && options.offset === 100
              ? [{ name: 'last', id: 'object' }]
              : [],
    }));
    expect((await handler(req())).status).toBe(200);
    expect(remove).toHaveBeenCalledTimes(4);
    expect(remove.mock.calls[0][0]).toHaveLength(100);
    expect(remove.mock.calls[0][0]).toContain(`${id}/nested/leaf`);
    expect(remove.mock.calls[1][0]).toEqual([`${id}/last`]);
  });
  test.each(['list', 'remove', 'non-error'])(
    'storage %s failure leaves durable cleanup but deleted account succeeds',
    async (phase) => {
      if (phase === 'list') list.mockResolvedValue({ error: { message: 'storage unavailable' } });
      if (phase === 'non-error') list.mockRejectedValue('storage unavailable');
      if (phase === 'remove') {
        list.mockResolvedValue({ data: [{ name: 'file', id: 'object' }] });
        remove.mockResolvedValue({ error: { message: 'storage unavailable' } });
      }
      expect((await handler(req())).status).toBe(200);
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ last_error: expect.any(String), retry_at: expect.any(String) }),
      );
      expect(finish).not.toHaveBeenCalled();
    },
  );
  test('empty nullable listing safely completes', async () => {
    list.mockResolvedValue({ data: null });
    expect((await handler(req())).status).toBe(200);
    expect(remove).not.toHaveBeenCalled();
  });
  test.each(['complete', 'held', 'budget'])(
    'guarded cleanup %s uses actual fenced HTTP client',
    async (state) => {
      settings.MODERATION_MEDIA_CLEANUP_ENABLED = 'true';
      list.mockResolvedValue({
        data: Array.from({ length: state === 'budget' ? 5 : 1 }, (_, i) => ({
          name: `file${i}`,
          id: 'object',
        })),
      });
      transport.mockImplementation(async (url: string, init: RequestInit) => {
        if (url.includes('/claim_media_cleanup_v1'))
          return Response.json(
            state === 'held'
              ? []
              : [{ path: JSON.parse(init.body as string).p_paths[0], state: 'complete' }],
          );
        return Response.json({ code: 'NoSuchKey' }, { status: 404 });
      });
      expect((await handler(req())).status).toBe(200);
      expect(remove).not.toHaveBeenCalled();
      expect(mockCreateClient.mock.calls[2][2].global.fetch).toEqual(expect.any(Function));
      if (state === 'complete') expect(finish).toHaveBeenCalledTimes(1);
      else {
        expect(finish).not.toHaveBeenCalled();
        expect(update).toHaveBeenCalled();
      }
    },
  );
});
