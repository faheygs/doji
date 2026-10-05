jest.mock(
  'cloudflare:workers',
  () => ({
    DurableObject: class {
      ctx: unknown;
      env: unknown;
      constructor(ctx: unknown, env: unknown) {
        this.ctx = ctx;
        this.env = env;
      }
    },
  }),
  { virtual: true },
);
jest.mock('../../infra/doji-orchestrator/src/sentry', () => ({
  captureWorkerException: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../infra/doji-orchestrator/src/operational-health', () => ({
  ...jest.requireActual('../../infra/doji-orchestrator/src/operational-health'),
  sendOperationalAlert: jest.fn().mockResolvedValue(undefined),
  checkOperationalHealth: jest.fn(),
}));
jest.mock('../../infra/doji-orchestrator/src/command-gateway', () => ({
  handleCommandGateway: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../infra/doji-orchestrator/src/portal-read', () => ({
  handlePortalRead: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../infra/doji-orchestrator/src/scale-read', () => ({
  handleScaleRead: jest.fn().mockResolvedValue(null),
}));

import worker, {
  DojiEventAlarm,
  PushFanoutAlarm,
  DataMaintenanceAlarm,
  type Env,
} from '../../infra/doji-orchestrator/src/index';
import { OutboxRelayAlarm } from '../../infra/doji-orchestrator/src/outbox-relay';
import { HealthMonitor } from '../../infra/doji-orchestrator/src/health-monitor';
import { captureWorkerException } from '../../infra/doji-orchestrator/src/sentry';
import {
  checkOperationalHealth,
  sendOperationalAlert,
} from '../../infra/doji-orchestrator/src/operational-health';
import { handleCommandGateway } from '../../infra/doji-orchestrator/src/command-gateway';
import { handlePortalRead } from '../../infra/doji-orchestrator/src/portal-read';
import { handleScaleRead } from '../../infra/doji-orchestrator/src/scale-read';

function storageFixture() {
  const rows = new Map<string, unknown>();
  const pending: Promise<unknown>[] = [];
  const storage = {
    get: jest.fn(async (key: string) => structuredClone(rows.get(key))),
    put: jest.fn(async (key: string, value: unknown) => {
      rows.set(key, structuredClone(value));
    }),
    delete: jest.fn(async (key: string) => rows.delete(key)),
    setAlarm: jest.fn().mockResolvedValue(undefined),
    deleteAlarm: jest.fn().mockResolvedValue(undefined),
  };
  const ctx = { storage, waitUntil: jest.fn((promise: Promise<unknown>) => pending.push(promise)) };
  return {
    rows,
    storage,
    pending,
    ctx: ctx as unknown as ConstructorParameters<typeof DojiEventAlarm>[0],
  };
}
function namespace() {
  const fetch = jest.fn(async () => Response.json({ scheduled: true }));
  return { fetch, idFromName: jest.fn((name: string) => name), get: jest.fn(() => ({ fetch })) };
}
let fixture: ReturnType<typeof storageFixture>;
let env: Env;
let relay: ReturnType<typeof namespace>;
let events: ReturnType<typeof namespace>;
let pushes: ReturnType<typeof namespace>;
let maintenance: ReturnType<typeof namespace>;
let health: ReturnType<typeof namespace>;
const transport = jest.fn();
const originalFetch = global.fetch;
const NOW = Date.parse('2026-10-01T12:00:00Z');
const event = {
  dailyEventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  firesAt: new Date(NOW + 1200000).toISOString(),
  closesAt: new Date(NOW + 1800000).toISOString(),
  phase: 'activate',
  chainNext: true,
};
function req(method = 'POST', body: unknown = {}, path = '/wake') {
  return new Request(`https://alarm.invalid${path}`, {
    method,
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
  });
}
function fanout(
  tasks = [{ shard: 0, attempts: 0, availableAt: NOW }],
  patch: Record<string, unknown> = {},
) {
  return {
    dailyEventId: event.dailyEventId,
    expiresAt: NOW + 120000,
    tasks,
    alerted: false,
    ...patch,
  };
}
beforeEach(() => {
  jest.clearAllMocks();
  fixture = storageFixture();
  relay = namespace();
  events = namespace();
  pushes = namespace();
  maintenance = namespace();
  health = namespace();
  env = {
    SUPABASE_URL: 'https://database.invalid',
    SUPABASE_ANON_KEY: 'synthetic',
    OUTBOX_RELAY_SECRET: 'relay-secret',
    ORCHESTRATOR_SECRET: 'event-secret',
    DOJI_EVENT_ALARM: events,
    OUTBOX_RELAY_ALARM: relay,
    PUSH_FANOUT_ALARM: pushes,
    DATA_MAINTENANCE_ALARM: maintenance,
    HEALTH_MONITOR: health,
  } as unknown as Env;
  global.fetch = transport;
  transport.mockReset().mockImplementation(async () => Response.json({}));
  jest.useFakeTimers({ now: NOW });
  for (const level of ['info', 'warn', 'error'] as const)
    jest.spyOn(console, level).mockImplementation(() => {});
  jest.mocked(checkOperationalHealth).mockReset().mockResolvedValue({ healthy: true });
  for (const handler of [handleCommandGateway, handlePortalRead, handleScaleRead])
    jest.mocked(handler).mockReset().mockResolvedValue(null);
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('event one-shot lifecycle', () => {
  test.each(['GET', 'DELETE'])('rejects unsupported %s', async (method) => {
    expect((await new DojiEventAlarm(fixture.ctx, env).fetch(req(method)))?.status).toBe(405);
    expect(fixture.storage.put).not.toHaveBeenCalled();
  });
  test.each([
    [{ ...event, phase: undefined }, NOW],
    [{ ...event, phase: 'activate' }, NOW + 1200000],
    [{ ...event, phase: 'close' }, NOW + 1800000],
    [{ ...event, phase: 'close', chainNext: false, closeAction: 'close_targeted' }, NOW + 1800000],
  ])('persists and schedules the exact phase (%j)', async (input, alarmAt) => {
    const result = await new DojiEventAlarm(fixture.ctx, env).fetch(req('PUT', input));
    expect(result.status).toBe(200);
    expect(fixture.storage.setAlarm).toHaveBeenCalledWith(alarmAt);
    expect(fixture.rows.get('event')).toMatchObject({
      dailyEventId: event.dailyEventId,
      phase: input.phase ?? 'prelive',
    });
  });
  test.each([
    { ...event, dailyEventId: '' },
    { ...event, phase: 'activate', firesAt: 'invalid' },
    { ...event, phase: 'close', closesAt: undefined },
  ])('rejects invalid alarm state (%j)', async (input) => {
    expect((await new DojiEventAlarm(fixture.ctx, env).fetch(req('POST', input))).status).toBe(400);
    expect(fixture.storage.setAlarm).not.toHaveBeenCalled();
  });
  test('re-registering an existing phase repairs its consumed alarm without replacing state', async () => {
    fixture.rows.set('event', event);
    await new DojiEventAlarm(fixture.ctx, env).fetch(req('POST', event));
    expect(fixture.storage.put).not.toHaveBeenCalled();
    expect(fixture.storage.setAlarm).toHaveBeenCalledWith(NOW + 1200000);
  });
  test('an absent event is a no-op', async () => {
    await new DojiEventAlarm(fixture.ctx, env).alarm();
    expect(transport).not.toHaveBeenCalled();
  });
  test('prelive commits before waking realtime and schedules activation once', async () => {
    fixture.rows.set('event', { ...event, phase: 'prelive' });
    await new DojiEventAlarm(fixture.ctx, env).alarm();
    expect(JSON.parse(transport.mock.calls[0][1].body)).toEqual({
      action: 'prelive',
      dailyEventId: event.dailyEventId,
    });
    expect(fixture.rows.get('event')).toMatchObject({ phase: 'activate' });
    expect(fixture.storage.setAlarm).toHaveBeenCalledWith(NOW + 1200000);
    expect(relay.fetch).toHaveBeenCalledTimes(1);
    expect(pushes.fetch).not.toHaveBeenCalled();
  });
  test('activation uses the server close time and seeds fanout after commit', async () => {
    fixture.rows.set('event', event);
    const close = new Date(NOW + 600000).toISOString();
    transport.mockResolvedValue(
      Response.json({ activated_at: new Date(NOW).toISOString(), closes_at: close }),
    );
    await new DojiEventAlarm(fixture.ctx, env).alarm();
    expect(fixture.rows.get('event')).toMatchObject({ phase: 'close', closesAt: close });
    expect(fixture.storage.setAlarm).toHaveBeenCalledWith(NOW + 600000);
    expect(pushes.fetch).toHaveBeenCalledTimes(1);
  });
  test.each([true, false])(
    'close respects chainNext=%s and clears only the completed event',
    async (chainNext) => {
      fixture.rows.set('event', {
        ...event,
        phase: 'close',
        chainNext,
        ...(chainNext ? {} : { closeAction: 'close_targeted' }),
      });
      await new DojiEventAlarm(fixture.ctx, env).alarm();
      await Promise.all(fixture.pending);
      expect(JSON.parse(transport.mock.calls[0][1].body).action).toBe(
        chainNext ? 'close' : 'close_targeted',
      );
      expect(transport).toHaveBeenCalledTimes(chainNext ? 2 : 1);
      if (chainNext) expect(transport.mock.calls[1][0]).toContain('schedule-daily-challenge');
      expect(fixture.rows.has('event')).toBe(false);
      expect(maintenance.fetch).toHaveBeenCalledTimes(1);
    },
  );
  test.each(['orchestrate', 'relay', 'push', 'next'])(
    'failure at %s retains the durable event for retry',
    async (stage) => {
      fixture.rows.set('event', { ...event, phase: stage === 'next' ? 'close' : 'activate' });
      transport.mockImplementation(async (url: string) =>
        url.includes('schedule-daily') || stage === 'orchestrate'
          ? new Response('failed', { status: 503 })
          : Response.json({ closes_at: event.closesAt }),
      );
      if (stage === 'relay') relay.fetch.mockResolvedValue(new Response('', { status: 503 }));
      if (stage === 'push') pushes.fetch.mockResolvedValue(new Response('', { status: 503 }));
      await expect(new DojiEventAlarm(fixture.ctx, env).alarm()).rejects.toThrow();
      expect(fixture.rows.has('event')).toBe(true);
    },
  );
  test('maintenance wake failure cannot undo a completed close', async () => {
    fixture.rows.set('event', { ...event, phase: 'close', chainNext: false });
    maintenance.fetch.mockResolvedValue(new Response('', { status: 503 }));
    await new DojiEventAlarm(fixture.ctx, env).alarm();
    await Promise.all(fixture.pending);
    expect(fixture.rows.has('event')).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });
});

describe('durable push fanout', () => {
  test('rejects wrong method and missing event', async () => {
    const alarm = new PushFanoutAlarm(fixture.ctx, env);
    expect((await alarm.fetch(req('GET'))).status).toBe(405);
    expect((await alarm.fetch(req())).status).toBe(400);
    expect(transport).not.toHaveBeenCalled();
  });
  test('an existing unfinished event repairs the alarm without relisting shards', async () => {
    fixture.rows.set('fanout', fanout());
    const result = await new PushFanoutAlarm(fixture.ctx, env).fetch(
      req('POST', { dailyEventId: event.dailyEventId }),
    );
    expect(await result.json()).toEqual({ scheduled: true, shards: 1 });
    expect(transport).not.toHaveBeenCalled();
    expect(fixture.storage.setAlarm).toHaveBeenCalledWith(NOW);
  });
  test('only valid bounded shard identifiers become tasks', async () => {
    transport.mockResolvedValue(Response.json({ shards: [-1, 0, 1, 127, 128, 1.5, '3'] }));
    await new PushFanoutAlarm(fixture.ctx, env).fetch(
      req('POST', { dailyEventId: event.dailyEventId }),
    );
    expect(fixture.rows.get('fanout')).toMatchObject({
      expiresAt: NOW + 120000,
      tasks: [0, 1, 127].map((shard) => ({ shard, attempts: 0, availableAt: NOW })),
    });
  });
  test('no eligible shards removes stale fanout state', async () => {
    fixture.rows.set('fanout', fanout([], { dailyEventId: 'old' }));
    transport.mockResolvedValue(Response.json({ shards: [] }));
    const result = await new PushFanoutAlarm(fixture.ctx, env).fetch(
      req('POST', { dailyEventId: event.dailyEventId }),
    );
    expect(await result.json()).toEqual({ scheduled: false, shards: 0 });
    expect(fixture.rows.has('fanout')).toBe(false);
  });
  test.each([Response.json({ shards: null }), new Response('denied', { status: 503 })])(
    'invalid shard listing never schedules tasks',
    async (response) => {
      transport.mockResolvedValue(response);
      await expect(
        new PushFanoutAlarm(fixture.ctx, env).fetch(
          req('POST', { dailyEventId: event.dailyEventId }),
        ),
      ).rejects.toThrow();
      expect(fixture.storage.put).not.toHaveBeenCalled();
    },
  );
  test('missing fanout is idle', async () => {
    await new PushFanoutAlarm(fixture.ctx, env).alarm();
    expect(transport).not.toHaveBeenCalled();
  });
  test.each([true, false])(
    'expired fanout is terminal and alerts only for unfinished=%s',
    async (unfinished) => {
      fixture.rows.set(
        'fanout',
        fanout(unfinished ? [{ shard: 2, attempts: 3, availableAt: NOW }] : [], { expiresAt: NOW }),
      );
      await new PushFanoutAlarm(fixture.ctx, env).alarm();
      expect(JSON.parse(transport.mock.calls[0][1].body)).toEqual({
        dailyEventId: event.dailyEventId,
        expire: true,
      });
      expect(fixture.rows.has('fanout')).toBe(false);
      expect(sendOperationalAlert).toHaveBeenCalledTimes(unfinished ? 1 : 0);
    },
  );
  test('not-yet-due tasks schedule their earliest time without a provider call', async () => {
    fixture.rows.set(
      'fanout',
      fanout([
        { shard: 0, attempts: 1, availableAt: NOW + 4000 },
        { shard: 1, attempts: 1, availableAt: NOW + 2000 },
      ]),
    );
    await new PushFanoutAlarm(fixture.ctx, env).alarm();
    expect(fixture.storage.setAlarm).toHaveBeenCalledWith(NOW + 2000);
    expect(transport).not.toHaveBeenCalled();
  });
  test('a completed shard removes fanout state', async () => {
    fixture.rows.set('fanout', fanout());
    transport.mockResolvedValue(Response.json({ continued: false }));
    await new PushFanoutAlarm(fixture.ctx, env).alarm();
    expect(fixture.rows.has('fanout')).toBe(false);
  });
  test('continued work resets its attempts and processes at most eight shards per alarm', async () => {
    fixture.rows.set(
      'fanout',
      fanout(Array.from({ length: 10 }, (_, shard) => ({ shard, attempts: 2, availableAt: NOW }))),
    );
    transport.mockResolvedValue(Response.json({ continued: true }));
    await new PushFanoutAlarm(fixture.ctx, env).alarm();
    expect(transport).toHaveBeenCalledTimes(8);
    expect(fixture.rows.get('fanout')).toMatchObject({
      tasks: expect.arrayContaining([
        { shard: 0, attempts: 0, availableAt: NOW },
        { shard: 8, attempts: 2, availableAt: NOW },
      ]),
    });
  });
  test.each([
    ['json retry', '{"retryAfterSeconds":7}', 0, 7000],
    ['minimum retry', '{"retryAfterSeconds":0}', 0, 1000],
    ['invalid body', 'unavailable', 0, 2000],
    ['bounded retry', '{}', 6, 15000],
  ])('failed shard retains work with %s', async (_name, body, attempts, delay) => {
    fixture.rows.set(
      'fanout',
      fanout([{ shard: 0, attempts: Number(attempts), availableAt: NOW }]),
    );
    transport.mockResolvedValue(new Response(String(body), { status: 503 }));
    await new PushFanoutAlarm(fixture.ctx, env).alarm();
    expect(fixture.rows.get('fanout')).toMatchObject({
      tasks: [{ shard: 0, attempts: Number(attempts) + 1, availableAt: NOW + Number(delay) }],
    });
  });
  test.each([false, true])(
    'eighth shard failure pages once; previously alerted=%s',
    async (alerted) => {
      fixture.rows.set(
        'fanout',
        fanout([{ shard: 1, attempts: 7, availableAt: NOW }], { alerted }),
      );
      transport.mockRejectedValue(new Error('offline'));
      await new PushFanoutAlarm(fixture.ctx, env).alarm();
      expect(sendOperationalAlert).toHaveBeenCalledTimes(alerted ? 0 : 1);
      expect(fixture.rows.get('fanout')).toMatchObject({ alerted: true });
    },
  );
});

describe('maintenance and router boundaries', () => {
  test('maintenance only accepts POST', async () => {
    const alarm = new DataMaintenanceAlarm(fixture.ctx, env);
    expect((await alarm.fetch(req('GET'))).status).toBe(405);
    expect((await alarm.fetch(req())).status).toBe(200);
    expect(fixture.storage.setAlarm).toHaveBeenCalledWith(NOW);
  });
  test.each([true, false, undefined])(
    'maintenance continues only explicit hasMore=%s',
    async (hasMore) => {
      transport.mockResolvedValue(Response.json({ hasMore }));
      await new DataMaintenanceAlarm(fixture.ctx, env).alarm();
      expect(fixture.storage.setAlarm).toHaveBeenCalledTimes(hasMore === true ? 1 : 0);
      if (hasMore) expect(fixture.storage.setAlarm).toHaveBeenCalledWith(NOW + 1000);
    },
  );
  test('maintenance failure schedules bounded recovery', async () => {
    transport.mockResolvedValue(new Response('failed', { status: 503 }));
    await new DataMaintenanceAlarm(fixture.ctx, env).alarm();
    expect(fixture.storage.setAlarm).toHaveBeenCalledWith(NOW + 30000);
  });
  test.each([handleCommandGateway, handlePortalRead, handleScaleRead])(
    'a recognized request is handled before the internal authorization gate',
    async (handler) => {
      jest.mocked(handler).mockResolvedValueOnce(new Response('handled', { status: 202 }));
      const result = await worker.fetch(req(), env, {} as Parameters<typeof worker.fetch>[2]);
      expect(result.status).toBe(202);
      expect(await result.text()).toBe('handled');
      expect(relay.fetch).not.toHaveBeenCalled();
    },
  );
  test.each(['', 'Bearer wrong'])(
    'internal paths require the exact configured secret (%s)',
    async (authorization) => {
      const result = await worker.fetch(
        new Request('https://gateway.invalid/outbox/wake', {
          method: 'POST',
          headers: { authorization },
        }),
        env,
        {} as Parameters<typeof worker.fetch>[2],
      );
      expect(result.status).toBe(401);
      expect(relay.fetch).not.toHaveBeenCalled();
    },
  );
  test.each(['/outbox/wake', `/events/${event.dailyEventId}/alarm`, '/unknown'])(
    'authorized internal route %s delegates only to its object',
    async (path) => {
      const result = await worker.fetch(
        new Request(`https://gateway.invalid${path}`, {
          method: 'POST',
          headers: { authorization: 'Bearer event-secret' },
          body: '{}',
        }),
        env,
        {} as Parameters<typeof worker.fetch>[2],
      );
      expect(result.status).toBe(path === '/unknown' ? 404 : 200);
      expect(relay.fetch).toHaveBeenCalledTimes(path === '/outbox/wake' ? 1 : 0);
      expect(events.fetch).toHaveBeenCalledTimes(path.includes('/events/') ? 1 : 0);
    },
  );
  test('scheduled monitoring delegates one bounded check', async () => {
    await worker.scheduled({} as Parameters<typeof worker.scheduled>[0], env);
    expect(health.idFromName).toHaveBeenCalledWith('singleton');
    expect(health.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('outbox drain recovery', () => {
  test('unsupported methods do not schedule work', async () => {
    expect((await new OutboxRelayAlarm(fixture.ctx, env).fetch(req('GET'))).status).toBe(405);
  });
  test('PUT keeps an earlier wake and replaces a later wake', async () => {
    const alarm = new OutboxRelayAlarm(fixture.ctx, env);
    const first = new Date(NOW + 10000).toISOString();
    const earlier = new Date(NOW + 5000).toISOString();
    await alarm.fetch(req('PUT', { nextWakeAt: first }));
    await alarm.fetch(req('PUT', { nextWakeAt: new Date(NOW + 20000).toISOString() }));
    expect(fixture.storage.setAlarm).toHaveBeenCalledTimes(1);
    await alarm.fetch(req('PUT', { nextWakeAt: earlier }));
    expect(fixture.rows.get('wake')).toEqual({ nextWakeAt: earlier });
    await expect(alarm.fetch(req('PUT', { nextWakeAt: 'invalid' }))).rejects.toThrow(
      'Invalid outbox relay wake time',
    );
  });
  test.each(['{}', '{"examined":2,"published":2,"failed":0}'])(
    'POST starts a drain and clears crash recovery after completion (%s)',
    async (body) => {
      transport.mockResolvedValue(new Response(body));
      const alarm = new OutboxRelayAlarm(fixture.ctx, env);
      expect((await alarm.fetch(req())).status).toBe(200);
      await Promise.all(fixture.pending);
      expect(fixture.rows.has('wake')).toBe(false);
      expect(fixture.storage.deleteAlarm).toHaveBeenCalled();
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );
  test('a result with a future wake persists its exact next retry', async () => {
    const nextWakeAt = new Date(NOW + 9000).toISOString();
    transport.mockResolvedValue(Response.json({ nextWakeAt }));
    await new OutboxRelayAlarm(fixture.ctx, env).alarm();
    expect(fixture.rows.get('wake')).toEqual({ nextWakeAt });
  });
  test('eight full pages yield to a fresh durable alarm', async () => {
    transport.mockImplementation(async () =>
      Response.json({ hasMore: true, examined: 10, published: 9, failed: 1 }),
    );
    await new OutboxRelayAlarm(fixture.ctx, env).alarm();
    expect(transport).toHaveBeenCalledTimes(8);
    expect(fixture.storage.setAlarm).toHaveBeenLastCalledWith(NOW);
  });
  test.each([0, 9, 10, 20])(
    'relay failure count %i retries and only pages on the tenth failure',
    async (prior) => {
      fixture.rows.set('failures', prior);
      transport.mockImplementation(async () => new Response('offline', { status: 503 }));
      await new OutboxRelayAlarm(fixture.ctx, env).alarm();
      expect(fixture.rows.get('failures')).toBe(prior + 1);
      expect(sendOperationalAlert).toHaveBeenCalledTimes(prior === 9 ? 1 : 0);
      expect(fixture.storage.setAlarm).toHaveBeenLastCalledWith(
        NOW + Math.min(30000, 1000 * 2 ** Math.min(prior, 5)),
      );
    },
  );
  test('non-Error relay failure is reported and still gets a retry', async () => {
    fixture.rows.set('failures', 9);
    transport.mockRejectedValue('offline');
    await new OutboxRelayAlarm(fixture.ctx, env).alarm();
    expect(sendOperationalAlert).toHaveBeenCalledWith(env, 'domain-relay-repeated-failure', {
      failures: 10,
      error: 'Relay network',
    });
  });
  test.each(['invalid', 'null', '[]', '{"nextWakeAt":"not-a-date"}'])(
    'malformed success cannot clear durable recovery: %s', async body => {
      transport.mockResolvedValue(new Response(body));
      await new OutboxRelayAlarm(fixture.ctx, env).alarm();
      expect(fixture.rows.get('failures')).toBe(1);
      expect(fixture.storage.setAlarm).toHaveBeenLastCalledWith(NOW + 1000);
    },
  );
  test.each(['headers', 'body'])(
    'hung %s is bounded; concurrent wakes coalesce and empty retry preserves lease recovery', async stage => {
      let late!: (value: Response) => void;
      let signal!: AbortSignal;
      transport.mockImplementationOnce((_url, init) => {
        signal = init.signal;
        return stage === 'headers'
          ? new Promise<Response>(resolve => { late = resolve; })
          : Promise.resolve({ ok: true, text: () => new Promise(() => {}) });
      }).mockImplementation(async () => Response.json({}));
      const alarm = new OutboxRelayAlarm(fixture.ctx, env);
      await alarm.fetch(req());
      await alarm.fetch(req());
      expect(transport).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(5000);
      await Promise.all(fixture.pending);
      expect(signal.aborted).toBe(true);
      expect(fixture.storage.setAlarm).toHaveBeenLastCalledWith(NOW + 6000);
      expect(console.warn).toHaveBeenCalledWith('[outbox-relay] request failed',
        expect.stringContaining('"failureKind":"timeout"'));
      await jest.advanceTimersByTimeAsync(1000);
      await alarm.alarm();
      expect(fixture.rows.get('wake')).toEqual({nextWakeAt: new Date(NOW + 155000).toISOString()});
      const count = transport.mock.calls.length;
      if (stage === 'headers') late(Response.json({ nextWakeAt: new Date(NOW + 999999).toISOString() }));
      await Promise.resolve();
      expect(transport).toHaveBeenCalledTimes(count);
      expect(fixture.rows.get('wake')).toEqual({nextWakeAt: new Date(NOW + 155000).toISOString()});
      await jest.advanceTimersByTimeAsync(149000);
      await alarm.alarm();
      expect(fixture.rows.has('wake')).toBe(false);
      expect(fixture.rows.has('uncertainRecheckAt')).toBe(false);
    },
  );
  test('recovery attempt retains the cold-start budget and diagnostics omit upstream bodies', async () => {
    fixture.rows.set('uncertainRecheckAt', NOW + 150000);
    transport.mockImplementationOnce(() => new Promise(() => {}));
    const task = new OutboxRelayAlarm(fixture.ctx, env).alarm();
    await jest.advanceTimersByTimeAsync(5000);
    expect(fixture.rows.has('failures')).toBe(false);
    await jest.advanceTimersByTimeAsync(15000);
    await task;
    expect(fixture.rows.get('failures')).toBe(1);
    transport.mockResolvedValue(new Response('secret content', { status: 503 }));
    await new OutboxRelayAlarm(fixture.ctx, env).alarm();
    expect(JSON.stringify(jest.mocked(console.warn).mock.calls)).not.toContain('secret content');
  });
  test('a second wake during an active claim requests another page, not a concurrent drain', async () => {
    let finish!: (value: Response) => void;
    transport
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      )
      .mockImplementation(async () => Response.json({}));
    const alarm = new OutboxRelayAlarm(fixture.ctx, env);
    await alarm.fetch(req());
    expect(await (await alarm.fetch(req())).json()).toMatchObject({ rerunRequested: true });
    expect(transport).toHaveBeenCalledTimes(1);
    finish(Response.json({}));
    await Promise.all(fixture.pending);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(fixture.rows.has('wake')).toBe(false);
  });
  test('a storage scheduling failure rejects the wake and allows a later retry', async () => {
    fixture.storage.setAlarm.mockRejectedValueOnce(new Error('storage unavailable'));
    const alarm = new OutboxRelayAlarm(fixture.ctx, env);
    await expect(alarm.fetch(req())).rejects.toThrow('storage unavailable');
    fixture.rows.delete('wake');
    expect((await alarm.fetch(req())).status).toBe(200);
    await Promise.all(fixture.pending);
  });
});

describe('health monitor transitions', () => {
  test('rejects non-POST without doing a health read', async () => {
    expect((await new HealthMonitor(fixture.ctx, env).fetch(req('GET'))).status).toBe(405);
    expect(checkOperationalHealth).not.toHaveBeenCalled();
  });
  test('sustained degradation pages once and recovery resets the incident family', async () => {
    const alarm = new HealthMonitor(fixture.ctx, env);
    jest.mocked(checkOperationalHealth).mockResolvedValue({ outbox_overdue: 1 });
    for (let i = 0; i < 4; i++) await alarm.fetch(req());
    expect(sendOperationalAlert).toHaveBeenCalledTimes(1);
    jest.mocked(checkOperationalHealth).mockResolvedValueOnce({});
    await alarm.fetch(req());
    expect(fixture.rows.get('health')).toMatchObject({
      issueFamily: null,
      consecutiveUnhealthy: 0,
      alertedIssueFamily: null,
    });
    jest.mocked(checkOperationalHealth).mockResolvedValueOnce({ outbox_exhausted: 1 });
    await alarm.fetch(req());
    expect(sendOperationalAlert).toHaveBeenCalledTimes(2);
  });
  test.each([new Error('offline'), 'unavailable'])(
    'unavailable monitor pages on the third check once and recovers (%s)',
    async (error) => {
      const alarm = new HealthMonitor(fixture.ctx, env);
      jest.mocked(checkOperationalHealth).mockRejectedValue(error);
      for (let i = 1; i <= 4; i++) {
        const response = await alarm.fetch(req());
        expect(response.status).toBe(503);
        expect(await response.json()).toMatchObject({ failures: i, monitorUnavailable: true });
      }
      expect(captureWorkerException).toHaveBeenCalledTimes(1);
      expect(sendOperationalAlert).toHaveBeenCalledTimes(1);
      jest.mocked(checkOperationalHealth).mockResolvedValueOnce({});
      expect((await alarm.fetch(req())).status).toBe(200);
      expect(fixture.rows.get('health')).toMatchObject({
        consecutiveCheckFailures: 0,
        checkFailureAlerted: false,
      });
    },
  );
  test.each([true, false])(
    'health recovery callbacks propagate failed object responses (%s)',
    async (fail) => {
      if (fail) {
        relay.fetch.mockResolvedValue(new Response('', { status: 503 }));
        events.fetch.mockResolvedValue(new Response('', { status: 503 }));
      }
      jest.mocked(checkOperationalHealth).mockImplementation(async (_env, wake, repair) => {
        const work = [wake(), repair([{ ...event, phase: 'activate', closeAction: 'close' }])];
        const results = await Promise.allSettled(work);
        expect(results.map((result) => result.status)).toEqual(
          fail ? ['rejected', 'rejected'] : ['fulfilled', 'fulfilled'],
        );
        return {};
      });
      await new HealthMonitor(fixture.ctx, env).fetch(req());
      expect(relay.fetch).toHaveBeenCalledTimes(1);
      expect(events.fetch).toHaveBeenCalledTimes(1);
    },
  );
});
