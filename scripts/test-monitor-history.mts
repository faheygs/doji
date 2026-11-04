import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMonitorHistoryRequest } from '../supabase/functions/operational-health/monitor-history.ts';
import { reportMonitorObservation } from '../infra/doji-orchestrator/src/monitor-history.ts';
import { assessMonitorHeartbeat, checkMonitor } from './monitor-check.mts';
import { validMonitorObservation } from '../supabase/functions/_shared/monitor-observation.ts';
const config = { enabled: 'true', environment: 'staging', supabaseUrl: 'https://ohrcupagdoilkwhecict.supabase.co', writeSecret: 'synthetic-write', readSecret: 'synthetic-read' };
const observation = { id: '99100000-0000-4000-8000-000000000001', observedAt: new Date().toISOString(), state: 'healthy' as const, family: null };
const heartbeat = { environment: 'staging', heartbeat: { enabled: true, checked_at: observation.observedAt, observed_at: observation.observedAt, received_at: observation.observedAt, state: 'healthy' } };
const request = (path = 'monitor-observation', body: unknown = observation, headers = { 'x-outbox-secret': config.writeSecret }) =>
  new Request(`https://local.test/functions/v1/operational-health/${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
const denied = () => { throw Error('Unexpected boundary call'); };

test('gates and separate scoped keys reject before database access', async () => {
  for (const patch of [{ enabled: 'false' }, { environment: 'unknown' }, { supabaseUrl: 'https://tvixsmqxotuvyjqzmjla.supabase.co' }])
    assert.equal((await handleMonitorHistoryRequest(request(), { ...config, ...patch }, denied))?.status, 404);
  assert.equal(await handleMonitorHistoryRequest(new Request('https://local.test/'), config, denied), null);
  assert.equal((await handleMonitorHistoryRequest(request('monitor-observation', observation, { 'x-outbox-secret': config.readSecret }), config, denied))?.status, 401);
  assert.equal((await handleMonitorHistoryRequest(new Request('https://local.test/monitor-check', { headers: { 'x-outbox-secret': config.writeSecret } }), config, denied))?.status, 401);
  assert.equal((await handleMonitorHistoryRequest(request('monitor-check'), config, denied))?.status, 405);
  assert.equal((await handleMonitorHistoryRequest(request(), { ...config, writeSecret: undefined }, denied))?.status, 401);
});
test('strict payload and bounded body reject private fields, arbitrary labels and malformed input', async () => {
  for (const body of [null, [], {}, { ...observation, member: 'private' }, { ...observation, id: 'bad' }, { ...observation, observedAt: 'bad' }, { ...observation, state: 'bad' }, { ...observation, family: 'raw-message' }, { ...observation, state: 'degraded' }, { padding: 'a'.repeat(1100) }]) {
    assert.equal(validMonitorObservation(body), false);
    assert.equal((await handleMonitorHistoryRequest(request('monitor-observation', body), config, denied))?.status, 400);
  }
  assert.equal(validMonitorObservation({ ...observation, state: 'unavailable', family: 'operational-health-check-failed' }), true);
  const malformed = new Request('https://local.test/monitor-observation', { method: 'POST', headers: { 'x-outbox-secret': config.writeSecret }, body: '{' });
  assert.equal((await handleMonitorHistoryRequest(malformed, config, denied))?.status, 400);
});
test('worker writes only worker observations once; failure/replay is not acknowledgement', async () => {
  for (const result of [{ data: true }, { data: false }, { error: 'private DB error' }]) {
    let calls = 0;
    const response = await handleMonitorHistoryRequest(request(), config, () => ({ rpc: (name, args) => {
      calls++;
      assert.equal(name, 'record_monitor_observation_v1');
      assert.deepEqual(args, { p_monitor: 'worker', p_observation_id: observation.id, p_observed_at: observation.observedAt, p_state: 'healthy', p_family: null });
      return { abortSignal: async () => result };
    } }));
    assert.equal(calls, 1);
    assert.equal(response?.status, result.error ? 503 : result.data ? 204 : 409);
    assert.equal(await response?.text(), '');
  }
});
test('independent read performs only fixed heartbeat read and does not repair or write', async () => {
  const response = await handleMonitorHistoryRequest(new Request('https://local.test/monitor-check', { headers: { 'x-monitor-check-secret': config.readSecret } }), config, () => ({ rpc: (name) => {
    assert.equal(name, 'get_monitor_heartbeat_v1');
    return { abortSignal: async () => ({ data: { ...heartbeat.heartbeat, private: 'must-not-leave' } }) };
  } }));
  assert.equal(response?.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response?.json(), heartbeat);
});
test('hung database is bounded without retry', async () => {
  let calls = 0;
  const result = await handleMonitorHistoryRequest(request(), config, () => ({ rpc: () => { calls++; return { abortSignal: () => new Promise(() => {}) }; } }));
  assert.equal(result?.status, 503); assert.equal(calls, 1);
});
test('HTTP uptime monitors fail on disabled, missing, stale, skewed or unhealthy evidence', async () => {
  const now = Date.now();
  const fresh = { ...heartbeat.heartbeat, checked_at: new Date(now).toISOString(), observed_at: new Date(now).toISOString(), received_at: new Date(now).toISOString() };
  for (const patch of [{ enabled: false }, { observed_at: null }, { observed_at: new Date(now - 181000).toISOString() },
    { checked_at: new Date(now - 31000).toISOString() }, { state: 'degraded' }, { state: 'unavailable' }]) {
    let reads = 0;
    const response = await handleMonitorHistoryRequest(new Request('https://local.test/monitor-check', { headers: { 'x-monitor-check-secret': config.readSecret } }), config, () => ({ rpc: name => {
      reads++; assert.equal(name, 'get_monitor_heartbeat_v1');
      return { abortSignal: async () => ({ data: { ...fresh, ...patch } }) };
    } }));
    assert.equal(response?.status, 503);
    assert.equal(reads, 1);
    assert.equal(response?.headers.get('cache-control'), 'no-store');
  }
});
test('Worker reporting denies mixed environment and preserves original response under failures', async () => {
  const env = { MONITOR_HISTORY_ENABLED: 'true', DOJI_ENVIRONMENT: 'staging', SUPABASE_URL: config.supabaseUrl, OUTBOX_RELAY_SECRET: config.writeSecret };
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = denied;
    for (const patch of [{ MONITOR_HISTORY_ENABLED: undefined }, { DOJI_ENVIRONMENT: undefined }, { SUPABASE_URL: 'https://tvixsmqxotuvyjqzmjla.supabase.co' }, { OUTBOX_RELAY_SECRET: '' }])
      assert.equal(await reportMonitorObservation({ ...env, ...patch }, observation), false);
    assert.equal(await reportMonitorObservation(env, { ...observation, id: 'bad' }), false);
    for (const status of [204, 409, 401, 503]) {
      let calls = 0;
      globalThis.fetch = async (url, init) => {
        calls++; assert.equal(url, `${config.supabaseUrl}/functions/v1/operational-health/monitor-observation`);
        assert.equal(init?.redirect, 'error'); assert.equal(init?.body, JSON.stringify(observation));
        return new Response(null, { status });
      };
      assert.equal(await reportMonitorObservation(env, observation), status === 204); assert.equal(calls, 1);
    }
    globalThis.fetch = async () => { throw Error('private upstream detail'); };
    assert.equal(await reportMonitorObservation(env, observation), false);
    globalThis.fetch = () => new Promise(() => {});
    assert.equal(await reportMonitorObservation(env, observation), false);
  } finally { globalThis.fetch = previous; }
});
test('dead-man assessment rejects stale healthy data, stopped reporting, bad clocks and unhealthy states', () => {
  const now = Date.parse(observation.observedAt);
  assert.equal(assessMonitorHeartbeat(heartbeat, 'staging', now).ok, true);
  for (const value of [null, {}, { ...heartbeat, environment: 'production' }])
    assert.equal(assessMonitorHeartbeat(value, 'staging', now).ok, false);
  for (const patch of [{ enabled: false }, { observed_at: null }, { observed_at: new Date(now - 180001).toISOString() }, { received_at: new Date(now - 1).toISOString() }, { checked_at: new Date(now - 31000).toISOString() }, { observed_at: new Date(now + 1).toISOString() }, { state: 'degraded' }, { state: 'unavailable' }])
    assert.equal(assessMonitorHeartbeat({ ...heartbeat, heartbeat: { ...heartbeat.heartbeat, ...patch } }, 'staging', now).ok, false);
});
test('independent probe pins host/key, denies redirects, bounds bytes and emits no raw failures', async () => {
  assert.equal((await checkMonitor('unknown', 'secret', denied)).reason, 'invalid_configuration');
  assert.equal((await checkMonitor('staging', '', denied)).ok, false);
  const now = () => Date.parse(observation.observedAt);
  let calls = 0;
  const success = await checkMonitor('staging', 'synthetic-read', async (url, init) => {
    calls++; assert.equal(url, `${config.supabaseUrl}/functions/v1/operational-health/monitor-check`);
    assert.equal(init?.redirect, 'error'); assert.equal(new Headers(init?.headers).get('x-monitor-check-secret'), 'synthetic-read');
    return Response.json(heartbeat);
  }, now);
  assert.equal(success.ok, true); assert.equal(calls, 1);
  for (const response of [new Response('private-error', { status: 503 }), new Response('bad json'), new Response('a'.repeat(4097))])
    assert.equal((await checkMonitor('staging', 'synthetic', async () => response, now)).ok, false);
  const failure = await checkMonitor('staging', 'synthetic', async () => { throw Error('private-token'); });
  assert.equal(JSON.stringify(failure).includes('private-token'), false);
  assert.equal((await checkMonitor('staging', 'synthetic', () => new Promise(() => {}))).reason, 'probe_timeout');
});
