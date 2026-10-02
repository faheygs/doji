jest.mock(
  'https://esm.sh/@supabase/supabase-js@2',
  () => ({ createClient: (...args: unknown[]) => mockCreateClient(...args) }),
  { virtual: true },
);
jest.mock('npm:@noble/hashes@1.8.0/sha256', () => jest.requireActual('@noble/hashes/sha256'), {
  virtual: true,
});
const mockCreateClient = jest.fn();
const rpc = jest.fn();
const list = jest.fn();
const remove = jest.fn();
const transport = jest.fn();
const id = '11111111-1111-4111-8111-111111111111';
const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Deno');
const originalFetch = global.fetch;
let settings: Record<string, string | undefined>;
let handler: (request: Request) => Promise<Response>;
const load = (name: string) =>
  jest.isolateModules(() => require(`../../supabase/functions/${name}/index`));
const request = (data: unknown = {}, secret = 'synthetic') =>
  new Request('https://synthetic.invalid/edge', {
    method: 'POST',
    headers: {
      'x-outbox-secret': secret,
      'x-orchestrator-secret': secret,
      'content-type': 'application/json',
    },
    body: JSON.stringify(data),
  });
beforeEach(() => {
  settings = {
    SUPABASE_URL: 'https://database.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_synthetic',
    OUTBOX_RELAY_SECRET: 'synthetic',
    DOJI_ORCHESTRATOR_SECRET: 'synthetic',
    DOJI_ORCHESTRATOR_URL: 'https://worker.invalid/',
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
  rpc.mockReset().mockResolvedValue({ data: null, error: null });
  list.mockReset().mockResolvedValue({ data: [] });
  remove.mockReset().mockResolvedValue({ error: null });
  mockCreateClient
    .mockReset()
    .mockReturnValue({ rpc, storage: { from: () => ({ list, remove }) } });
  transport.mockReset().mockImplementation(async () => new Response(null));
  global.fetch = transport;
  jest.spyOn(console, 'error').mockImplementation(() => {});
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
describe('maintenance queues and hard bounds', () => {
  beforeEach(() => load('run-data-maintenance'));
  const item = { id, bucket_id: 'post-media', object_path: 'member/file' };
  const account = { user_id: id, claim_token: 'synthetic-lease' };
  test.each([undefined, ''])('missing secret rejects before database', async (secret) => {
    settings.OUTBOX_RELAY_SECRET = secret;
    expect((await handler(request())).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  test('wrong caller rejected', async () => {
    expect((await handler(request({}, 'wrong'))).status).toBe(401);
  });
  test('empty queues yield explicit zero totals', async () => {
    const res = await handler(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      totals: {},
      orphaned_media: 0,
      committed_media_intents: 0,
      stale_push_endpoints: 0,
      expired_rate_limit_buckets: 0,
      deleted_post_media: 0,
      deleted_account_media: 0,
      hasMore: false,
    });
    expect(rpc).toHaveBeenCalledWith('run_operational_retention_batch', { p_limit: 5000 });
    expect(remove).not.toHaveBeenCalled();
  });
  test.each([
    'run_operational_retention_batch',
    'claim_expired_media_upload_intents',
    'delete_media_upload_intents',
    'delete_stale_committed_media_upload_intents',
    'delete_stale_push_endpoints',
    'delete_expired_api_rate_limit_buckets',
    'claim_pending_media_deletions',
    'delete_pending_media_deletions',
    'claim_account_deletion_cleanup',
    'finish_account_deletion_cleanup',
  ])('database error at %s prevents false completion', async (failure) => {
    rpc.mockImplementation(async (name) =>
      name === failure
        ? { error: { message: 'synthetic failure' } }
        : {
            data:
              name === 'claim_expired_media_upload_intents' ||
              name === 'claim_pending_media_deletions'
                ? [item]
                : name === 'claim_account_deletion_cleanup'
                  ? [account]
                  : null,
          },
    );
    expect((await handler(request())).status).toBe(500);
  });
  test('all maintenance loops stop after five batches, with backlog flagged', async () => {
    rpc.mockImplementation(async (name) => ({
      data:
        name === 'run_operational_retention_batch'
          ? { removed: 10, has_more: true, ignored: 'not numeric' }
          : [
                'delete_stale_committed_media_upload_intents',
                'delete_stale_push_endpoints',
                'delete_expired_api_rate_limit_buckets',
              ].includes(name)
            ? 5000
            : null,
    }));
    const res = await handler(request());
    expect(await res.json()).toMatchObject({
      totals: { removed: 50 },
      committed_media_intents: 25000,
      stale_push_endpoints: 25000,
      expired_rate_limit_buckets: 25000,
      hasMore: true,
    });
    for (const name of [
      'run_operational_retention_batch',
      'delete_stale_committed_media_upload_intents',
      'delete_stale_push_endpoints',
      'delete_expired_api_rate_limit_buckets',
    ])
      expect(rpc.mock.calls.filter(([n]) => n === name)).toHaveLength(5);
  });
  test('legacy media queues group exact paths by bucket and acknowledge after removal', async () => {
    const items = [
      item,
      { ...item, id: 'second', object_path: 'member/second' },
      { ...item, id: 'avatar', bucket_id: 'avatars', object_path: 'member/avatar' },
    ];
    rpc.mockImplementation(async (name) => ({
      data: ['claim_expired_media_upload_intents', 'claim_pending_media_deletions'].includes(name)
        ? items
        : ['delete_media_upload_intents', 'delete_pending_media_deletions'].includes(name)
          ? 3
          : null,
    }));
    expect(await (await handler(request())).json()).toMatchObject({
      orphaned_media: 3,
      deleted_post_media: 3,
    });
    expect(remove).toHaveBeenCalledWith(['member/file', 'member/second']);
    expect(remove).toHaveBeenCalledWith(['member/avatar']);
    expect(rpc).toHaveBeenCalledWith('delete_media_upload_intents', {
      p_ids: [id, 'second', 'avatar'],
    });
  });
  test.each(['expired', 'pending'])(
    'storage failure for %s queue never acknowledges deletion',
    async (queue) => {
      const claim =
        queue === 'expired'
          ? 'claim_expired_media_upload_intents'
          : 'claim_pending_media_deletions';
      const finish =
        queue === 'expired' ? 'delete_media_upload_intents' : 'delete_pending_media_deletions';
      rpc.mockImplementation(async (name) => ({ data: name === claim ? [item] : null }));
      remove.mockResolvedValue({ error: { message: 'storage failure' } });
      expect((await handler(request())).status).toBe(500);
      expect(rpc.mock.calls.some(([name]) => name === finish)).toBe(false);
    },
  );
  test('full media batches continue but never exceed bound', async () => {
    const items = Array.from({ length: 500 }, (_, i) => ({
      ...item,
      id: `synthetic-${i}`,
      object_path: `member/${i}`,
    }));
    rpc.mockImplementation(async (name) => ({
      data: ['claim_expired_media_upload_intents', 'claim_pending_media_deletions'].includes(name)
        ? items
        : ['delete_media_upload_intents', 'delete_pending_media_deletions'].includes(name)
          ? 500
          : null,
    }));
    expect(await (await handler(request())).json()).toMatchObject({
      orphaned_media: 2500,
      deleted_post_media: 2500,
    });
    expect(remove).toHaveBeenCalledTimes(10);
  });
  test('account cleanup traverses folders, paginates, and batches exact object paths', async () => {
    rpc.mockImplementation(async (name) => ({
      data: name === 'claim_account_deletion_cleanup' ? [account] : null,
    }));
    list.mockImplementation(async (folder: string, options: { offset: number }) => ({
      data: folder.endsWith('/nested')
        ? [{ id: 'leaf', name: 'leaf' }]
        : options.offset === 0
          ? Array.from({ length: 100 }, (_, i) => ({
              id: i === 0 ? null : 'object',
              name: i === 0 ? 'nested' : `file${i}`,
            }))
          : options.offset === 100
            ? [{ id: 'tail', name: 'tail' }]
            : [],
    }));
    expect(await (await handler(request())).json()).toMatchObject({ deleted_account_media: 1 });
    expect(remove).toHaveBeenCalledTimes(4);
    expect(remove.mock.calls[0][0]).toContain(`${id}/nested/leaf`);
    expect(rpc).toHaveBeenCalledWith('finish_account_deletion_cleanup', {
      p_user_id: id,
      p_claim_token: 'synthetic-lease',
      p_error: null,
    });
  });
  test.each(['list', 'remove', 'non-error'])(
    'account %s failure persists recovery instead of declaring cleaned',
    async (stage) => {
      rpc.mockImplementation(async (name) => ({
        data: name === 'claim_account_deletion_cleanup' ? [account] : null,
      }));
      if (stage === 'list') list.mockResolvedValue({ error: { message: 'listing failure' } });
      else if (stage === 'non-error') list.mockRejectedValue('failure');
      else {
        list.mockResolvedValue({ data: [{ id: 'object', name: 'file' }] });
        remove.mockResolvedValue({ error: { message: 'deletion failure' } });
      }
      expect(await (await handler(request())).json()).toMatchObject({ deleted_account_media: 0 });
      expect(rpc).toHaveBeenCalledWith(
        'finish_account_deletion_cleanup',
        expect.objectContaining({ p_error: expect.any(String) }),
      );
    },
  );
  test('account full claims stop at five batches', async () => {
    rpc.mockImplementation(async (name) => ({
      data: name === 'claim_account_deletion_cleanup' ? Array(100).fill(account) : null,
    }));
    list.mockResolvedValue({ data: null });
    expect(await (await handler(request())).json()).toMatchObject({ deleted_account_media: 500 });
    expect(
      rpc.mock.calls.filter(([name]) => name === 'claim_account_deletion_cleanup'),
    ).toHaveLength(5);
  });
  test.each(['complete', 'held', 'failure', 'budget'])(
    'guarded cleanup %s keeps each queue isolated and only acknowledges confirmed work',
    async (state) => {
      settings.MODERATION_MEDIA_CLEANUP_ENABLED = 'true';
      const items =
        state === 'budget'
          ? Array.from({ length: 500 }, (_, i) => ({
              ...item,
              id: `synthetic-${i}`,
              object_path: `member/file${i}`,
            }))
          : [item];
      rpc.mockImplementation(async (name) => ({
        data:
          name === 'claim_media_cleanup_candidates_v1'
            ? items
            : name === 'claim_account_deletion_cleanup'
              ? [account]
              : null,
      }));
      list.mockResolvedValue({
        data: Array.from({ length: state === 'budget' ? 21 : 1 }, (_, i) => ({
          id: 'object',
          name: `file${i}`,
        })),
      });
      transport.mockImplementation(async (url: string, init: RequestInit) => {
        if (state === 'failure') return new Response(null, { status: 500 });
        if (url.includes('/claim_media_cleanup_v1'))
          return Response.json(
            state === 'held'
              ? []
              : [{ path: JSON.parse(init.body as string).p_paths[0], state: 'complete' }],
          );
        return Response.json({ code: 'NoSuchKey' }, { status: 404 });
      });
      const response = await handler(request());
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(remove).not.toHaveBeenCalled();
      expect(rpc).toHaveBeenCalledWith('claim_media_cleanup_candidates_v1', {
        p_kind: 'expired',
        p_limit: 20,
      });
      expect(rpc).toHaveBeenCalledWith('claim_media_cleanup_candidates_v1', {
        p_kind: 'pending',
        p_limit: 20,
      });
      expect(rpc).toHaveBeenCalledWith('delete_media_upload_intents', {
        p_ids:
          state === 'complete'
            ? [id]
            : state === 'budget'
              ? items.slice(0, 20).map((i) => i.id)
              : [],
      });
      if (state === 'failure') expect(result.totals.media_cleanup_deferred).toBe(2);
      expect(result.deleted_account_media).toBe(state === 'complete' ? 1 : 0);
    },
  );
});

describe('atomic daily preparation and durable alarm registration', () => {
  const prepared = {
    daily_event_id: id,
    challenge_id: 'synthetic-challenge',
    fires_at: '2026-10-03T19:00:00Z',
    already_prepared: false,
  };
  beforeEach(() => {
    jest.useFakeTimers({
      now: new Date('2026-10-02T15:00:00Z'),
      doNotFake: ['nextTick', 'setImmediate'],
    });
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    rpc.mockResolvedValue({ data: prepared });
    load('schedule-daily-challenge');
  });
  test.each([undefined, ''])('missing secret rejects', async (secret) => {
    settings.DOJI_ORCHESTRATOR_SECRET = secret;
    expect((await handler(request())).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  test('wrong caller rejects', async () => {
    expect((await handler(request({}, 'wrong'))).status).toBe(401);
  });
  test.each([false, true])(
    'reuses authoritative schedule; already_prepared=%s',
    async (already) => {
      rpc.mockResolvedValue({ data: { ...prepared, already_prepared: already } });
      const res = await handler(request());
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        daily_event_id: id,
        fires_at: prepared.fires_at,
        skipped: already,
      });
      expect(rpc).toHaveBeenCalledWith('prepare_next_daily_event', {
        p_proposed_fires_at: expect.any(String),
        p_window_minutes: 10,
      });
      const [url, init] = transport.mock.calls[0];
      expect(url).toBe(`https://worker.invalid/events/${id}/alarm`);
      expect(init.method).toBe('PUT');
      expect(JSON.parse(init.body)).toEqual({
        dailyEventId: id,
        firesAt: prepared.fires_at,
        phase: 'prelive',
      });
      expect(init.signal).toBeInstanceOf(AbortSignal);
    },
  );
  test.each([
    ['2026-01-02T15:00:00Z', false, '2026-01-02'],
    ['2026-07-02T15:00:00Z', false, '2026-07-02'],
    ['2026-10-02T15:00:00Z', true, '2026-10-03'],
    ['2026-10-03T01:59:00Z', false, '2026-10-03'],
  ])(
    'selects future slot across timezone/day boundary %s force=%s',
    async (now, force, expectedDate) => {
      jest.setSystemTime(new Date(now as string));
      expect((await handler(request({ forceNextDay: force }))).status).toBe(200);
      const fires = new Date(rpc.mock.calls[0][1].p_proposed_fires_at);
      expect(fires.getTime()).toBeGreaterThan(Date.now());
      expect(fires.toISOString().slice(0, 10)).toBe(expectedDate);
      const hourPacific = Number(
        new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Los_Angeles',
          hour: '2-digit',
          hour12: false,
        }).format(fires),
      );
      const hourEastern = Number(
        new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          hour: '2-digit',
          hour12: false,
        }).format(fires),
      );
      expect(hourPacific).toBeGreaterThanOrEqual(10);
      expect(hourEastern).toBeLessThan(22);
    },
  );
  test.each([null, {}, { daily_event_id: id }, { fires_at: prepared.fires_at }])(
    'missing authoritative event blocks alarm %j',
    async (value) => {
      rpc.mockResolvedValue({ data: value });
      expect((await handler(request())).status).toBe(500);
      expect(transport).not.toHaveBeenCalled();
    },
  );
  test.each([new Error('database failure'), { message: 'database failure' }])(
    'preparation error blocks alarm',
    async (error) => {
      rpc.mockResolvedValue({ error });
      expect((await handler(request())).status).toBe(500);
      expect(transport).not.toHaveBeenCalled();
    },
  );
  test.each(['DOJI_ORCHESTRATOR_URL', 'DOJI_ORCHESTRATOR_SECRET'])(
    'missing alarm %s is not silently successful',
    async (key) => {
      if (key === 'DOJI_ORCHESTRATOR_SECRET')
        rpc.mockImplementation(async () => {
          settings[key] = '';
          return { data: prepared };
        });
      else settings[key] = '';
      expect((await handler(request())).status).toBe(500);
      expect(transport).not.toHaveBeenCalled();
    },
  );
  test('alarm HTTP rejection fails the request without scheduling a replacement', async () => {
    transport.mockResolvedValue(new Response('synthetic failure', { status: 503 }));
    expect((await handler(request())).status).toBe(500);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  test('malformed body fails before preparation', async () => {
    expect(
      (
        await handler(
          new Request('https://synthetic.invalid', {
            method: 'POST',
            headers: { 'x-orchestrator-secret': 'synthetic' },
            body: '{',
          }),
        )
      ).status,
    ).toBe(500);
    expect(rpc).not.toHaveBeenCalled();
  });
  test('empty body uses defaults', async () => {
    expect(
      (
        await handler(
          new Request('https://synthetic.invalid', {
            method: 'POST',
            headers: { 'x-orchestrator-secret': 'synthetic' },
          }),
        )
      ).status,
    ).toBe(200);
  });
});
