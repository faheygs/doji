import { observeWorkflow, schedulerLogRetention, WorkflowObservation, workflowHealthEnabled } from '../../supabase/functions/_shared/workflow-health';
const deno = Object.getOwnPropertyDescriptor(globalThis, 'Deno');
const runtime = Object.getOwnPropertyDescriptor(globalThis, 'EdgeRuntime');
let settings: Record<string, string | undefined>;
let tasks: Promise<unknown>[];
const send = jest.fn();
const rpc = jest.fn(() => ({ abortSignal: send }));
beforeEach(() => {
  settings = { WORKFLOW_HEALTH_ENABLED: 'true', DOJI_ENVIRONMENT: 'staging',
    SUPABASE_URL: 'https://ohrcupagdoilkwhecict.supabase.co' };
  tasks = [];
  Object.defineProperty(globalThis, 'Deno', { configurable: true,
    value: { env: { get: (key: string) => settings[key] } } });
  Object.defineProperty(globalThis, 'EdgeRuntime', { configurable: true,
    value: { waitUntil: (task: Promise<unknown>) => tasks.push(task) } });
  send.mockReset().mockResolvedValue({ data: true, error: null });
  rpc.mockClear();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); });
afterAll(() => {
  if (deno) Object.defineProperty(globalThis, 'Deno', deno); else Reflect.deleteProperty(globalThis, 'Deno');
  if (runtime) Object.defineProperty(globalThis, 'EdgeRuntime', runtime); else Reflect.deleteProperty(globalThis, 'EdgeRuntime');
});
test.each([undefined, 'false'])('disabled has no telemetry I/O (%s)', async value => {
  settings.WORKFLOW_HEALTH_ENABLED = value;
  expect((await observeWorkflow('activate', rpc, async () => new Response('ok'))).status).toBe(200);
  expect(rpc).not.toHaveBeenCalled(); expect(tasks).toHaveLength(0);
});
test.each(['production', 'unknown', undefined])('mixed or missing environment fails closed (%s)', environment => {
  settings.DOJI_ENVIRONMENT = environment;
  expect(workflowHealthEnabled()).toBe(false);
});
test('production requires its own exact project', () => {
  settings.DOJI_ENVIRONMENT = 'production';
  settings.SUPABASE_URL = 'https://tvixsmqxotuvyjqzmjla.supabase.co';
  expect(workflowHealthEnabled()).toBe(true);
});
test.each(['https://ohrcupagdoilkwhecict.supabase.co.evil.invalid', 'http://ohrcupagdoilkwhecict.supabase.co'])('rejects invalid project URL %s', url => {
  settings.SUPABASE_URL = url; expect(workflowHealthEnabled()).toBe(false);
});
test('records one bounded success without response body, actor, or command key', async () => {
  const response = new Response('private answer');
  expect(await observeWorkflow('activate', rpc, async () => response)).toBe(response);
  await Promise.all(tasks);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith('record_workflow_health_v1', {
    p_workflow: 'activate', p_outcome: 'succeeded', p_phase: 'command', p_elapsed_ms: expect.any(Number), p_counts: {},
  });
  expect(send.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
  expect(JSON.stringify(rpc.mock.calls)).not.toContain('private answer');
});
test.each([false, true])('records failed response/exception without replacing original outcome (%s)', throws => {
  const original = Error('private upstream failure');
  return (async () => {
    const promise = observeWorkflow('maintenance', rpc, async observation => {
      observation.phase = 'post_media'; observation.count('deleted_post_media', 2);
      if (throws) throw original;
      return new Response('private upstream failure', { status: 500 });
    });
    if (throws) await expect(promise).rejects.toBe(original);
    else expect((await promise).status).toBe(500);
    await Promise.all(tasks);
    expect(rpc.mock.calls[0]).toEqual(['record_workflow_health_v1', expect.objectContaining({
      p_outcome: 'failed', p_phase: 'post_media', p_counts: { deleted_post_media: 2 },
    })]);
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('private upstream failure');
  })();
});
test('deferred work is not successful cleanup', async () => {
  await observeWorkflow('maintenance', rpc, async observation => {
    observation.deferred = true; return new Response('ok');
  });
  await Promise.all(tasks);
  expect(rpc.mock.calls[0]).toEqual(['record_workflow_health_v1', expect.objectContaining({ p_outcome: 'deferred' })]);
});
test('deferred media retains its first blocked phase after other queues finish', async () => {
  await observeWorkflow('maintenance', rpc, async observation => {
    observation.phase = 'post_media'; observation.defer();
    observation.phase = 'account_media'; observation.defer();
    observation.phase = 'complete'; return new Response('ok');
  });
  await Promise.all(tasks);
  expect(rpc.mock.calls[0]).toEqual(['record_workflow_health_v1', expect.objectContaining({
    p_outcome: 'deferred', p_phase: 'post_media',
  })]);
});
test.each([{ data: false }, { error: 'private', data: null }])('recording failure cannot break success or log private error (%j)', async value => {
  send.mockResolvedValue(value);
  expect((await observeWorkflow('activate', rpc, async () => new Response())).status).toBe(200);
  await Promise.all(tasks);
  expect(console.error).toHaveBeenCalledWith('workflow_health_observation_unavailable');
  expect(rpc).toHaveBeenCalledTimes(1);
});
test('rejected telemetry has no retry and no effect on source response', async () => {
  send.mockRejectedValue(Error('secret'));
  expect((await observeWorkflow('close', rpc, async () => new Response())).status).toBe(200);
  await Promise.all(tasks); expect(rpc).toHaveBeenCalledTimes(1);
});
test('no runtime owner means no unowned telemetry request', async () => {
  Reflect.deleteProperty(globalThis, 'EdgeRuntime');
  expect((await observeWorkflow('activate', rpc, async () => new Response())).status).toBe(200);
  expect(rpc).not.toHaveBeenCalled();
});
test('bounded allowlist drops unknown, fractional, negative and oversized counts', () => {
  const observation = new WorkflowObservation();
  observation.count('password', 1);
  for (const value of [-1, 1.2, Infinity, 1000000]) observation.count('deleted_post_media', value);
  expect(observation.snapshot()).toEqual({});
  observation.count('deleted_post_media', 3);
  const copy = observation.snapshot(); copy.deleted_post_media = 8;
  expect(observation.snapshot()).toEqual({ deleted_post_media: 3 });
});
test('retention is separately gated', async () => {
  expect(await schedulerLogRetention(rpc, new WorkflowObservation())).toBe(false);
  expect(rpc).not.toHaveBeenCalled();
  settings.SCHEDULER_LOG_RETENTION_ENABLED = 'true'; settings.DOJI_ENVIRONMENT = 'wrong';
  await expect(schedulerLogRetention(rpc, new WorkflowObservation())).rejects.toThrow('environment unavailable');
  expect(rpc).not.toHaveBeenCalled();
});
test.each([null, {}, { enabled: false, has_more: false }, { enabled: true, has_more: 'yes', scanned: 500, succeeded_deleted: 1, failed_deleted: 0 },
  { enabled: true, has_more: true, scanned: 501, succeeded_deleted: 1, failed_deleted: 0 }])('malformed retention receipt never claims drained (%j)', async data => {
  settings.SCHEDULER_LOG_RETENTION_ENABLED = 'true'; send.mockResolvedValue({ data });
  await expect(schedulerLogRetention(rpc, new WorkflowObservation())).rejects.toThrow();
});
test('retention errors preserve failure, not zero deletions', async () => {
  settings.SCHEDULER_LOG_RETENTION_ENABLED = 'true'; send.mockResolvedValue({ error: 'secret' });
  await expect(schedulerLogRetention(rpc, new WorkflowObservation())).rejects.toThrow('retention unavailable');
});
test.each([true, false])('bounded retention returns backlog %s and committed counts', async hasMore => {
  settings.SCHEDULER_LOG_RETENTION_ENABLED = 'true';
  send.mockResolvedValue({ data: { enabled: true, has_more: hasMore, scanned: 500, succeeded_deleted: 4, failed_deleted: 2 } });
  const observation = new WorkflowObservation();
  expect(await schedulerLogRetention(rpc, observation)).toBe(hasMore);
  expect(rpc).toHaveBeenCalledWith('run_scheduler_log_retention_v1', { p_limit: 500 });
  expect(observation.phase).toBe('scheduler_logs');
  expect(observation.snapshot()).toEqual({ scheduler_succeeded_deleted: 4, scheduler_failed_deleted: 2 });
});
