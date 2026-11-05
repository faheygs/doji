import { captureSentryMonitorHistory } from '../../supabase/functions/operational-health/sentry-monitor-history';
import { sentryMonitorObservations, stagingSentryChecksUrl, stagingSentryMonitorUrl } from '../../supabase/functions/_shared/sentry-monitor-contract';
import { stagingFetch } from '../../supabase/functions/_shared/staging-egress';

const now = Date.parse('2026-11-05T03:00:00Z');
const check = (seconds = 0, status = 'success') => ({
  uptimeCheckId: `9763b4555dc855779ac9dd504193fd${String(seconds).padStart(2, '0')}`,
  timestamp: new Date(now - seconds * 1000).toISOString().replace('.000Z', 'Z'),
  environment: 'staging', checkStatus: status, httpStatusCode: 200,
});
const config = { enabled: 'true', historyEnabled: 'true', environment: 'staging',
  supabaseUrl: 'https://ohrcupagdoilkwhecict.supabase.co', token: 'synthetic-read' };
const monitor = { id: '10858429', projectSlug: 'doji-staging', environment: 'staging', method: 'GET',
  status: 'active', intervalSeconds: 60, url: config.supabaseUrl + '/functions/v1/operational-health/monitor-check' };
const bindMonitor = () => upstream.mockResolvedValueOnce(Response.json(monitor));
const record = jest.fn(async () => ({ error: undefined }));
const upstream = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
beforeEach(() => { record.mockClear(); upstream.mockReset(); });
afterEach(() => jest.useRealTimers());

test('fixed provider checks preserve source identity/time, ordered degradation and recovery', async () => {
  const checks = [check(0), check(60, 'failure_incident'), check(90, 'failure')];
  bindMonitor();
  upstream.mockResolvedValue(Response.json(checks));
  expect(await captureSentryMonitorHistory(config, record, upstream, () => now)).toBe('processed');
  expect(upstream).toHaveBeenCalledTimes(2);
  expect(upstream).toHaveBeenNthCalledWith(1, stagingSentryMonitorUrl, expect.anything());
  expect(upstream).toHaveBeenCalledWith(stagingSentryChecksUrl, expect.objectContaining({
    method: 'GET', redirect: 'error', headers: { authorization: 'Bearer synthetic-read' },
  }));
  expect(record.mock.calls).toHaveLength(3);
  expect(record.mock.calls.map(call => (call as unknown as [Record<string, unknown>])[0])).toEqual([
    expect.objectContaining({ p_monitor: 'watchdog', p_state: 'degraded', p_observed_at: '2026-11-05T02:58:30.000Z' }),
    expect.objectContaining({ p_monitor: 'watchdog', p_state: 'unavailable', p_family: 'monitor-heartbeat-missing' }),
    { p_monitor: 'watchdog', p_state: 'healthy', p_family: null,
      p_observed_at: '2026-11-05T03:00:00.000Z', p_observation_id: '9763b455-5dc8-5577-9ac9-dd504193fd00' },
  ]);
});

test.each([
  { enabled: undefined }, { enabled: 'false' }, { historyEnabled: 'false' },
  { environment: 'production' }, { supabaseUrl: 'https://tvixsmqxotuvyjqzmjla.supabase.co' }, { token: '' },
])('disabled or mixed bindings make no network/database call: %j', async override => {
  await captureSentryMonitorHistory({ ...config, ...override }, record, upstream, () => now);
  expect(upstream).not.toHaveBeenCalled(); expect(record).not.toHaveBeenCalled();
});

test.each([
  null, {}, [], Array(6).fill(check()), [null], [[]], [check(), check()],
  [{ ...check(), uptimeCheckId: 'bad' }], [{ ...check(), timestamp: 'bad' }],
  [{ ...check(), timestamp: '2026-11-05T03:00:01Z' }],
  [{ ...check(), environment: 'production' }], [{ ...check(), checkStatus: 'new-status' }],
  [{ ...check(), httpStatusCode: 500 }], [{ ...check(), httpStatusCode: '200' }],
  [{ ...check(), timestamp: '2026-02-31T03:00:00Z' }],
])('invalid/empty/mixed data cannot become healthy: %j', async value => {
  bindMonitor();
  upstream.mockResolvedValue(Response.json(value));
  expect(await captureSentryMonitorHistory(config, record, upstream, () => now)).toBe('unavailable');
  expect(record).not.toHaveBeenCalled();
});

test('stale checks expire rather than renewing on read; extra provider fields are never stored', () => {
  const stale = { ...check(), timestamp: '2026-11-05T02:56:59Z' };
  expect(() => sentryMonitorObservations([stale], now, monitor)).toThrow();
  expect(() => sentryMonitorObservations([check()], NaN, monitor)).toThrow();
  const rows = sentryMonitorObservations([stale, { ...check(60), raw: 'PRIVATE' }], now, monitor);
  expect(rows).toHaveLength(1); expect(JSON.stringify(rows)).not.toContain('PRIVATE');
});

test.each([301, 401, 403, 429, 500])('HTTP %s never retries or writes history', async status => {
  upstream.mockResolvedValue(new Response('PRIVATE', { status }));
  expect(await captureSentryMonitorHistory(config, record, upstream, () => now)).toBe('unavailable');
  expect(upstream).toHaveBeenCalledTimes(1); expect(record).not.toHaveBeenCalled();
});

test('malformed/oversized/missing bodies and network failures remain unavailable', async () => {
  for (const response of [new Response('{'), new Response('x'.repeat(16385)), new Response(null)]) {
    upstream.mockResolvedValueOnce(response);
    expect(await captureSentryMonitorHistory(config, record, upstream, () => now)).toBe('unavailable');
  }
  upstream.mockRejectedValueOnce(Error('PRIVATE'));
  expect(await captureSentryMonitorHistory(config, record, upstream, () => now)).toBe('unavailable');
  expect(record).not.toHaveBeenCalled();
});

test('database failure stops the bounded sequence, without retry', async () => {
  bindMonitor();
  upstream.mockResolvedValue(Response.json([check(), check(60)]));
  const failed = jest.fn(async () => ({ error: 'PRIVATE' }));
  expect(await captureSentryMonitorHistory(config, failed, upstream, () => now)).toBe('unavailable');
  expect(failed).toHaveBeenCalledTimes(1);
});

test('whole-operation deadline fences late headers, stalled body and late writes', async () => {
  jest.useFakeTimers();
  let release!: (response: Response) => void;
  upstream.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const headers = captureSentryMonitorHistory(config, record, upstream, () => now);
  await jest.advanceTimersByTimeAsync(2000); expect(await headers).toBe('unavailable');
  release(Response.json([check()])); await jest.advanceTimersByTimeAsync(0);
  expect(record).not.toHaveBeenCalled();
  let endBody!: (value: ReadableStreamReadResult<Uint8Array>) => void;
  const cancel = jest.fn(async () => { endBody({ done: true, value: undefined }); });
  upstream.mockResolvedValueOnce({ status: 200, body: { getReader: () => ({ cancel,
    read: () => new Promise<ReadableStreamReadResult<Uint8Array>>(resolve => { endBody = resolve; }),
  }) } } as unknown as Response);
  const body = captureSentryMonitorHistory(config, record, upstream, () => now);
  await jest.advanceTimersByTimeAsync(2000); expect(await body).toBe('unavailable');
  expect(cancel).toHaveBeenCalled(); expect(record).not.toHaveBeenCalled();
  bindMonitor(); upstream.mockResolvedValueOnce(Response.json([check(), check(60)]));
  let finish!: (value: { error?: unknown }) => void;
  const delayed = jest.fn(() => new Promise<{ error?: unknown }>(resolve => { finish = resolve; }));
  const write = captureSentryMonitorHistory(config, delayed, upstream, () => now);
  await jest.advanceTimersByTimeAsync(2000); expect(await write).toBe('unavailable');
  finish({}); await jest.advanceTimersByTimeAsync(0); expect(delayed).toHaveBeenCalledTimes(1);
});

test('staging egress admits only the exact authenticated GET and rejects other scopes', async () => {
  const bindings = { projectUrl: config.supabaseUrl, orchestratorUrl: 'https://doji-orchestrator-staging.faheygs.workers.dev',
    ablyKey: 'eVKl2g.synthetic:synthetic', sentryMonitorToken: config.token };
  upstream.mockResolvedValue(new Response(null));
  const send = stagingFetch(bindings, upstream);
  await send(stagingSentryChecksUrl, { headers: { authorization: 'Bearer synthetic-read' } });
  await send(stagingSentryMonitorUrl, { headers: { authorization: 'Bearer synthetic-read' } });
  expect((upstream.mock.calls[0][0] as Request).redirect).toBe('error');
  upstream.mockClear();
  for (const url of [stagingSentryChecksUrl.replace('10858429', '123'), stagingSentryChecksUrl.replace('doji-staging', 'react-native'),
    stagingSentryChecksUrl + '&extra=1', stagingSentryChecksUrl.replace('https:', 'http:')])
    await expect(send(url, { headers: { authorization: 'Bearer synthetic-read' } })).rejects.toThrow();
  await expect(send(stagingSentryChecksUrl, { method: 'POST', headers: { authorization: 'Bearer synthetic-read' } })).rejects.toThrow();
  await expect(send(stagingSentryChecksUrl, { headers: { authorization: 'Bearer wrong' } })).rejects.toThrow();
  await expect(stagingFetch({ ...bindings, sentryMonitorToken: undefined }, upstream)(stagingSentryChecksUrl)).rejects.toThrow();
  expect(upstream).not.toHaveBeenCalled();
});

test.each([null, [], {}, ...Object.entries({ id: '123', projectSlug: 'react-native', environment: '',
  method: 'POST', status: 'disabled', intervalSeconds: 300, url: 'https://production.invalid' })
  .map(([key, value]) => ({ ...monitor, [key]: value }))])('invalid monitor binding stops before checks: %j', async binding => {
  upstream.mockResolvedValueOnce(Response.json(binding));
  expect(await captureSentryMonitorHistory(config, record, upstream, () => now)).toBe('unavailable');
  expect(upstream).toHaveBeenCalledTimes(1); expect(record).not.toHaveBeenCalled();
  expect(() => sentryMonitorObservations([{ ...check(), environment: '' }], now, binding)).toThrow();
});

test('empty check environment requires verified staging configuration; config secrets are never stored', async () => {
  upstream.mockResolvedValueOnce(Response.json({ ...monitor, headers: { 'x-monitor-check-secret': 'PRIVATE' } }))
    .mockResolvedValueOnce(Response.json([{ ...check(), environment: '' }]));
  expect(await captureSentryMonitorHistory(config, record, upstream, () => now)).toBe('processed');
  expect(JSON.stringify(record.mock.calls)).not.toContain('PRIVATE');
  expect(() => sentryMonitorObservations([{ ...check(), environment: undefined }], now, monitor)).toThrow();
});

test('failed checks read after valid configuration cannot write or renew evidence', async () => {
  bindMonitor(); upstream.mockResolvedValueOnce(new Response(null, { status: 403 }));
  expect(await captureSentryMonitorHistory(config, record, upstream, () => now)).toBe('unavailable');
  expect(upstream).toHaveBeenCalledTimes(2); expect(record).not.toHaveBeenCalled();
});
