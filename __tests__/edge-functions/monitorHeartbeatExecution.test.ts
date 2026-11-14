import { handleMonitorHistoryRequest } from '../../supabase/functions/operational-health/monitor-history';
import { assessMonitorHeartbeat } from '../../supabase/functions/_shared/monitor-heartbeat';

const config = {
  enabled: 'true',
  environment: 'staging',
  supabaseUrl: 'https://ohrcupagdoilkwhecict.supabase.co',
  writeSecret: 'synthetic-write',
  readSecret: 'synthetic-read',
};
const now = 1793760000000;
const time = new Date(now).toISOString();
const observation = {
  id: '99100000-0000-4000-8000-000000000001',
  observedAt: time,
  state: 'healthy',
  family: null,
};
const heartbeat = {
  enabled: true,
  checked_at: time,
  observed_at: time,
  received_at: time,
  state: 'healthy',
};
const request = (write: boolean, body = JSON.stringify(observation)) =>
  new Request(`https://local.invalid/${write ? 'monitor-observation' : 'monitor-check'}`, {
    method: write ? 'POST' : 'GET',
    headers: write
      ? { 'x-outbox-secret': config.writeSecret }
      : { 'x-monitor-check-secret': config.readSecret },
    ...(write ? { body } : {}),
  });
const denied = () => {
  throw Error('Unexpected database access');
};
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(now);
});
afterEach(() => {
  jest.useRealTimers();
});

test('real read projection strips private fields and rejects stopped or invalid observations', async () => {
  for (const [patch, status] of [
    [{}, 200],
    [{ enabled: false }, 503],
    [{ observed_at: null }, 503],
    [{ observed_at: new Date(now - 180001).toISOString() }, 503],
    [{ checked_at: new Date(now - 30001).toISOString() }, 503],
    [{ received_at: new Date(now - 1).toISOString() }, 503],
    [{ received_at: new Date(now + 1).toISOString() }, 503],
    [{ state: 'degraded' }, 503],
    [{ state: 'unavailable' }, 503],
    [{ checked_at: 'bad' }, 503],
    [{ state: 'invented' }, 503],
  ] as const) {
    const rpc = jest.fn(() => ({
      abortSignal: async () => ({ data: { ...heartbeat, ...patch, private: 'must-not-leave' } }),
    }));
    const response = await handleMonitorHistoryRequest(request(false), config, () => ({ rpc }));
    expect(response?.status).toBe(status);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('get_monitor_heartbeat_v1');
    expect(await response?.text()).not.toContain('private');
  }
  for (const value of [
    null,
    {},
    [],
    { environment: 'production', heartbeat },
    { environment: 'staging', heartbeat: null },
  ])
    expect(assessMonitorHeartbeat(value, 'staging', now).ok).toBe(false);
});

test('writes are fixed, single-attempt and distinguish rejection from acknowledgement', async () => {
  for (const result of [{ data: true }, { data: false }, { error: 'private-error' }]) {
    const rpc = jest.fn(() => ({ abortSignal: async () => result }));
    const response = await handleMonitorHistoryRequest(request(true), config, () => ({ rpc }));
    expect(response?.status).toBe('error' in result ? 503 : result.data ? 204 : 409);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('record_monitor_observation_v1', {
      p_monitor: 'worker',
      p_observation_id: observation.id,
      p_observed_at: time,
      p_state: 'healthy',
      p_family: null,
    });
    expect(await response?.text()).toBe('');
  }
  for (const body of [
    '{',
    'null',
    JSON.stringify({ ...observation, answer: 'private' }),
    'a'.repeat(1025),
  ])
    expect((await handleMonitorHistoryRequest(request(true, body), config, denied))?.status).toBe(
      400,
    );
});

test('database failures and timeouts cannot become healthy or retry', async () => {
  for (const result of [{ error: 'private' }, { data: null }, { data: {} }]) {
    expect(
      (
        await handleMonitorHistoryRequest(request(false), config, () => ({
          rpc: () => ({ abortSignal: async () => result }),
        }))
      )?.status,
    ).toBe(503);
  }
  const failed = await handleMonitorHistoryRequest(request(false), config, () => ({
    rpc: () => {
      throw Error('private');
    },
  }));
  expect(failed?.status).toBe(503);
  expect(await failed?.text()).toBe('');
  const rpc = jest.fn(() => ({ abortSignal: () => new Promise<never>(() => {}) }));
  const pending = handleMonitorHistoryRequest(request(false), config, () => ({ rpc }));
  await jest.advanceTimersByTimeAsync(2001);
  expect((await pending)?.status).toBe(503);
  expect(rpc).toHaveBeenCalledTimes(1);
});

test('separate keys and disabled or mixed bindings deny database access', async () => {
  expect(
    await handleMonitorHistoryRequest(
      new Request('https://local.invalid/unrelated'),
      config,
      denied,
    ),
  ).toBeNull();
  for (const patch of [
    { enabled: 'false' },
    { environment: 'bad' },
    { supabaseUrl: 'https://tvixsmqxotuvyjqzmjla.supabase.co' },
  ])
    expect(
      (await handleMonitorHistoryRequest(request(false), { ...config, ...patch }, denied))?.status,
    ).toBe(404);
  expect(
    (
      await handleMonitorHistoryRequest(
        request(false),
        { ...config, readSecret: undefined },
        denied,
      )
    )?.status,
  ).toBe(401);
  expect(
    (
      await handleMonitorHistoryRequest(
        new Request('https://local.invalid/monitor-check', {
          headers: { 'x-outbox-secret': config.writeSecret },
        }),
        config,
        denied,
      )
    )?.status,
  ).toBe(401);
  expect(
    (
      await handleMonitorHistoryRequest(
        new Request('https://local.invalid/monitor-observation'),
        config,
        denied,
      )
    )?.status,
  ).toBe(405);
});
