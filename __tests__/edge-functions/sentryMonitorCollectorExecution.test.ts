jest.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: () => ({ rpc: mockRpc }),
}), { virtual: true });
const mockRpc = jest.fn();
const denoBefore = Object.getOwnPropertyDescriptor(globalThis, 'Deno');
const runtimeBefore = Object.getOwnPropertyDescriptor(globalThis, 'EdgeRuntime');
const originalFetch = global.fetch;
let handler: (request: Request) => Promise<Response>;
let settings: Record<string, string | undefined>;
let pending: Promise<unknown>[];
let transport: jest.Mock;
let failRuntime: boolean;
beforeEach(() => {
  pending = []; failRuntime = false;
  settings = { OUTBOX_RELAY_SECRET: 'synthetic', MONITOR_CHECK_SECRET: 'synthetic-read',
    MONITOR_HISTORY_ENABLED: 'true', DOJI_ENVIRONMENT: 'staging',
    SUPABASE_URL: 'https://ohrcupagdoilkwhecict.supabase.co', STAGING_SENTRY_MONITOR_READ_TOKEN: 'synthetic' };
  Object.defineProperty(globalThis, 'Deno', { configurable: true, value: {
    env: { get: (key: string) => settings[key] }, serve: (callback: typeof handler) => { handler = callback; },
  } });
  Object.defineProperty(globalThis, 'EdgeRuntime', { configurable: true, value: {
    waitUntil: (promise: Promise<unknown>) => { pending.push(promise); if (failRuntime) throw Error('Synthetic'); },
  } });
  mockRpc.mockReset().mockImplementation((name: string) => name === 'record_monitor_observation_v1'
    ? { abortSignal: async () => ({ data: true }) }
    : name === 'get_monitor_heartbeat_v1' ? { abortSignal: async () => ({ data: null }) }
      : Promise.resolve({ data: name === 'get_operational_health' ? { healthy: true } : [] }));
  transport = jest.fn(async () => { throw Error('Unmocked network denied'); }); global.fetch = transport;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.isolateModules(() => require('../../supabase/functions/operational-health/index'));
});
afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });
afterAll(() => {
  if (denoBefore) Object.defineProperty(globalThis, 'Deno', denoBefore); else Reflect.deleteProperty(globalThis, 'Deno');
  if (runtimeBefore) Object.defineProperty(globalThis, 'EdgeRuntime', runtimeBefore); else Reflect.deleteProperty(globalThis, 'EdgeRuntime');
});
const request = (authorized = true, path = '') => new Request(`https://synthetic.invalid/${path}`, {
  headers: authorized ? { 'x-outbox-secret': 'synthetic' } : {},
});

test('default off retains exact baseline reads and unauthorized calls never start importer', async () => {
  expect((await handler(request())).status).toBe(200);
  expect(mockRpc.mock.calls.map(call => call[0])).toEqual([
    'get_operational_health', 'get_repairable_doji_alarms', 'refresh_daily_event_health_snapshots_v1',
  ]);
  expect(transport).not.toHaveBeenCalled(); expect(pending).toHaveLength(0);
  settings.SENTRY_MONITOR_HISTORY_ENABLED = 'true'; mockRpc.mockClear();
  expect((await handler(request(false))).status).toBe(401);
  expect(mockRpc).not.toHaveBeenCalled(); expect(transport).not.toHaveBeenCalled();
  expect((await handler(request(true, 'monitor-check'))).status).toBe(401);
  expect(transport).not.toHaveBeenCalled();
});

test.each([false, true])('import failure never changes collector response; runtime rejection=%s', async rejectRuntime => {
  failRuntime = rejectRuntime; settings.SENTRY_MONITOR_HISTORY_ENABLED = 'true';
  expect((await handler(request())).status).toBe(200); await Promise.all(pending);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(mockRpc.mock.calls.some(call => call[0] === 'record_monitor_observation_v1')).toBe(false);
  expect(console.warn).toHaveBeenCalledWith('sentry_monitor_history_unavailable');
});

test('real handler records exact Sentry source observation only through the watchdog RPC', async () => {
  settings.SENTRY_MONITOR_HISTORY_ENABLED = 'true';
  const timestamp = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString().replace('.000Z', 'Z');
  transport.mockResolvedValueOnce(Response.json({ id: '10858429', projectSlug: 'doji-staging', environment: 'staging',
    method: 'GET', status: 'active', intervalSeconds: 60,
    url: 'https://ohrcupagdoilkwhecict.supabase.co/functions/v1/operational-health/monitor-check' }));
  transport.mockResolvedValueOnce(Response.json([{ uptimeCheckId: '9763b4555dc855779ac9dd504193fdea',
    timestamp, environment: 'staging', checkStatus: 'success', httpStatusCode: 200 }]));
  expect((await handler(request())).status).toBe(200); await Promise.all(pending);
  expect(mockRpc).toHaveBeenCalledWith('record_monitor_observation_v1', {
    p_monitor: 'watchdog', p_observation_id: '9763b455-5dc8-5577-9ac9-dd504193fdea',
    p_observed_at: new Date(timestamp).toISOString(), p_state: 'healthy', p_family: null,
  });
  expect(transport).toHaveBeenCalledTimes(2); expect(console.warn).not.toHaveBeenCalled();
});
