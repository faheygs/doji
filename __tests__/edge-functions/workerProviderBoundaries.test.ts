import { captureWorkerException } from '../../infra/doji-orchestrator/src/sentry';
import { expirePushFanout } from '../../infra/doji-orchestrator/src/push-fanout-lifecycle';
import {
  forScaleReadClient,
  scaleReadCache,
  storeScaleReadResponse,
} from '../../infra/doji-orchestrator/src/scale-read-cache';
import {
  checkOperationalHealth,
  fetchOperationalHealth,
  operationalHealthFailureDetails,
  sendOperationalAlert,
  actionableOperationalIssue,
} from '../../infra/doji-orchestrator/src/operational-health';

const originalFetch = global.fetch;
const transport = jest.fn();
const env = { SUPABASE_URL: 'https://database.invalid', OUTBOX_RELAY_SECRET: 'synthetic-only' };
beforeEach(() => {
  global.fetch = transport;
  transport.mockReset().mockImplementation(async () => Response.json({ healthy: true }));
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test.each([undefined, '', 'invalid', 'https://host.invalid/1', 'https://key@host.invalid/'])(
  'invalid or absent Sentry DSN makes no request (%s)',
  async (dsn) => {
    await captureWorkerException(dsn, 'test', new Error('synthetic'));
    expect(transport).not.toHaveBeenCalled();
  },
);
test.each(['https://key@host.invalid/123', 'https://key@host.invalid/prefix/123'])(
  'Sentry envelope respects DSN path and byte length: %s',
  async (dsn) => {
    await captureWorkerException(dsn, 'synthetic-operation', new Error('é'.repeat(1200)), {
      attempts: 3,
    });
    const [url, init] = transport.mock.calls[0];
    const parsedUrl = new URL(url);
    expect(parsedUrl.pathname).toBe(
      dsn.includes('prefix') ? '/prefix/api/123/envelope/' : '/api/123/envelope/',
    );
    expect(parsedUrl.searchParams.get('sentry_key')).toBe('key');
    const [header, item, event] = init.body.split('\n').map(JSON.parse);
    expect(header.dsn).toBe(dsn);
    expect(item.length).toBe(new TextEncoder().encode(init.body.split('\n')[2]).byteLength);
    expect(event.message.formatted).toHaveLength(1000);
    expect(event.extra).toEqual({ attempts: 3 });
    expect(event.tags.operation).toBe('synthetic-operation');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  },
);
test.each(['http', 'transport'])(
  'Sentry %s rejection never replaces the original failure',
  async (kind) => {
    if (kind === 'http') transport.mockResolvedValue(new Response('', { status: 503 }));
    else transport.mockRejectedValue(new Error('offline'));
    await expect(
      captureWorkerException('https://key@host.invalid/123', 'test', 'plain rejection'),
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  },
);
test.each([200, 503])(
  'push expiry uses one bounded request and preserves status %i',
  async (status) => {
    transport.mockResolvedValue(new Response('synthetic', { status }));
    const pending = expirePushFanout(env as Parameters<typeof expirePushFanout>[0], 'event-1');
    if (status === 200) await expect(pending).resolves.toBeUndefined();
    else await expect(pending).rejects.toThrow('503 synthetic');
    expect(transport).toHaveBeenCalledWith(
      'https://database.invalid/functions/v1/fanout-doji-push',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ dailyEventId: 'event-1', expire: true }),
        headers: { 'content-type': 'application/json', 'x-outbox-secret': 'synthetic-only' },
        signal: expect.any(AbortSignal),
      }),
    );
  },
);
test('client response is private without mutating the cached header contract', async () => {
  const original = new Response('body', {
    status: 202,
    headers: { 'cache-control': 'public,max-age=3', 'x-origin': 'retained' },
  });
  const client = forScaleReadClient(original, 'hit', 12);
  expect(client.status).toBe(202);
  expect(await client.text()).toBe('body');
  expect(client.headers.get('cache-control')).toBe('private, no-store');
  expect(original.headers.get('cache-control')).toBe('public,max-age=3');
  expect(client.headers.get('server-timing')).toBe('scale-read;dur=12');
  expect(client.headers.get('x-doji-scale-cache')).toBe('hit');
});
describe('cache writes', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  const put = jest.fn();
  beforeEach(() => {
    put.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: { default: { put } },
    });
  });
  afterEach(() => {
    if (previous) Object.defineProperty(globalThis, 'caches', previous);
    else Reflect.deleteProperty(globalThis, 'caches');
  });
  test.each([true, false])(
    'supports background context=%s and retains the original response body',
    async (background) => {
      const waitUntil = jest.fn();
      const response = Response.json({ result: true });
      const key = new Request('https://cache.invalid/test');
      await storeScaleReadResponse(
        key,
        response,
        'feed',
        background
          ? ({ waitUntil } as unknown as Parameters<typeof storeScaleReadResponse>[3])
          : undefined,
      );
      expect(scaleReadCache().put).toBe(put);
      expect(put).toHaveBeenCalledWith(key, expect.any(Response));
      expect(await response.json()).toEqual({ result: true });
      expect(waitUntil).toHaveBeenCalledTimes(background ? 1 : 0);
    },
  );
  test.each([new Error('full'), 'unknown'])('cache failure is contained: %s', async (error) => {
    put.mockRejectedValue(error);
    await expect(
      storeScaleReadResponse(new Request('https://cache.invalid/test'), Response.json({}), 'feed'),
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('scale_read_cache_error'));
  });
});
test('health request is bounded and preserves the received health object', async () => {
  const health = { healthy: true, sample_count: 12 };
  transport.mockResolvedValue(Response.json(health));
  expect(await fetchOperationalHealth(env)).toEqual(health);
  expect(transport).toHaveBeenCalledWith(
    'https://database.invalid/functions/v1/operational-health',
    expect.objectContaining({
      headers: { 'x-outbox-secret': 'synthetic-only' },
      signal: expect.any(AbortSignal),
    }),
  );
});
test.each([
  ['http', () => Promise.resolve(new Response('unavailable', { status: 503 })), 'http', 503],
  ['invalid JSON', () => Promise.resolve(new Response('not-json')), 'invalid-response', 200],
  ['network', () => Promise.reject('offline'), 'network', null],
  ['abort', () => Promise.reject({ name: 'AbortError' }), 'timeout', null],
  ['timeout', () => Promise.reject({ name: 'TimeoutError' }), 'timeout', null],
  ['timeout message', () => Promise.reject(new Error('request timed out')), 'timeout', null],
] as const)(
  'health %s failure retries once and records bounded diagnostics',
  async (_name, response, kind, status) => {
    jest.useFakeTimers();
    transport.mockImplementation(response);
    const result = fetchOperationalHealth(env).catch((error) => error);
    await jest.advanceTimersByTimeAsync(750);
    const error = await result;
    expect(transport).toHaveBeenCalledTimes(2);
    expect(operationalHealthFailureDetails(error)).toMatchObject({
      failure_kind: kind,
      attempts: 2,
      upstream_status: status,
      durable_event_state: 'unverified-health-read',
    });
  },
);
test('health retry can recover without reporting a stale first failure', async () => {
  jest.useFakeTimers();
  transport
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(Response.json({ healthy: true }));
  const pending = fetchOperationalHealth(env);
  await jest.advanceTimersByTimeAsync(750);
  expect(await pending).toEqual({ healthy: true });
});
test.each([null, undefined, 12, { name: 'Other' }, { message: 5 }])(
  'unknown health failure is classified as network without exposing input (%j)',
  (value) => {
    expect(operationalHealthFailureDetails(value)).toMatchObject({
      failure_kind: 'network',
      attempts: 2,
    });
  },
);
test.each([false, true])(
  'health repair and overdue wake use authorized callbacks; wake failure=%s is recoverable',
  async (failWake) => {
    const repair = {
      dailyEventId: 'event',
      phase: 'activate',
      firesAt: '2026-10-01T00:00:00Z',
      chainNext: true,
      closeAction: 'close',
    };
    const health = { alarm_repairs: [repair], outbox_overdue: 1 };
    transport.mockResolvedValue(Response.json(health));
    const wake = failWake
      ? jest.fn().mockRejectedValue(new Error('offline'))
      : jest.fn().mockResolvedValue(undefined);
    const repairs = jest.fn().mockResolvedValue(undefined);
    expect(await checkOperationalHealth(env, wake, repairs)).toEqual(health);
    expect(repairs).toHaveBeenCalledWith([repair]);
    expect(wake).toHaveBeenCalledTimes(1);
  },
);
test.each([
  {},
  { alarm_repairs: [], outbox_overdue: 0 },
  { alarm_repairs: 'invalid', outbox_overdue: -1 },
])('healthy/empty reads do not schedule work (%j)', async (health) => {
  transport.mockResolvedValue(Response.json(health));
  const wake = jest.fn();
  const repair = jest.fn();
  expect(await checkOperationalHealth(env, wake, repair)).toEqual(health);
  expect(wake).not.toHaveBeenCalled();
  expect(repair).not.toHaveBeenCalled();
});
test.each([200, 503])(
  'operational alert preserves its explicit issue and handles status %i',
  async (status) => {
    transport.mockResolvedValue(new Response('', { status }));
    const pending = sendOperationalAlert(env, 'synthetic', { sample_count: 3 });
    if (status === 200) await expect(pending).resolves.toBeUndefined();
    else await expect(pending).rejects.toThrow('503');
    expect(JSON.parse(transport.mock.calls[0][1].body)).toMatchObject({
      event: 'operational_health',
      issue_family: 'synthetic',
      source: 'doji-orchestrator',
      sample_count: 3,
    });
  },
);
test.each([
  [{ apns_provider_credential_errors: 1 }, 'apns-provider-credentials', true],
  [{ outbox_exhausted: 1 }, 'domain-outbox-exhausted', true],
  [{ push_exhausted_shards: 1 }, 'push-fanout-exhausted', true],
  [{ outbox_overdue: 1 }, 'domain-outbox-delayed', false],
  [{ realtime_max_ms_5m: 30001 }, 'realtime-delivery-degraded', false],
] as const)(
  'selects actionable health family with correct urgency (%j)',
  (health, family, immediate) => {
    expect(actionableOperationalIssue(health)).toMatchObject({ family, immediate });
  },
);
test.each([
  {},
  { realtime_max_ms_5m: 30000 },
  { realtime_sample_count_5m: 19, realtime_p95_ms_5m: 9999 },
  { realtime_sample_count_5m: 20, realtime_p95_ms_5m: 5000 },
])('does not page below measured boundaries (%j)', (health) =>
  expect(actionableOperationalIssue(health)).toBeNull(),
);
test.each([{ realtime_retried_samples_5m: 1 }, { realtime_max_publish_attempts_5m: 2 }, {}])(
  'classifies publication retries without claiming lost writes (%j)',
  (extra) => {
    expect(
      actionableOperationalIssue({
        realtime_sample_count_5m: 20,
        realtime_p95_ms_5m: 5001,
        ...extra,
      })?.diagnostics,
    ).toMatchObject({
      database_writes_at_risk: false,
      realtime_publish_retried: Object.keys(extra).length > 0,
    });
  },
);
