import { AppState, Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { normalize } from '@sentry/core';
import { appStateSnapshot, observeAndroidReadBody, startAndroidReadEvidence, summarizeAndroidReadFailure } from '../../lib/androidReadEvidence';
import { beginReadDiagnostics, finishReadDiagnostics, observedMemberFetch, readFailureDiagnostics } from '../../lib/memberReadDiagnostics';
import { runMemberRead } from '../../lib/runMemberRead';
import { boundedSupabaseFetch } from '../../lib/supabaseFetch';

const originalPlatform = Platform.OS, originalState = AppState.currentState;
const versionDescriptor = Object.getOwnPropertyDescriptor(Platform, 'Version');
const originalFetch = global.fetch;
beforeEach(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  Object.defineProperty(Platform, 'Version', { configurable: true, value: 36 });
  Object.defineProperty(AppState, 'currentState', { configurable: true, writable: true, value: 'active' });
});
afterEach(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
  if (versionDescriptor) Object.defineProperty(Platform, 'Version', versionDescriptor);
  Object.defineProperty(AppState, 'currentState', { configurable: true, writable: true, value: originalState });
  global.fetch = originalFetch; jest.restoreAllMocks(); jest.useRealTimers();
});
const sdk = () => createClient('https://synthetic.invalid', 'private-key', {
  accessToken: async () => 'private-token', global: { fetch: boundedSupabaseFetch },
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

test.each(['active', 'background', 'inactive', null, 'private-state'])('allowlists AppState snapshot %s', state => {
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: state });
  expect(appStateSnapshot()).toBe(['active', 'background', 'inactive'].includes(state as string) ? state : 'unknown');
});
test('missing native state cannot break observation', () => {
  Object.defineProperty(AppState, 'currentState', { configurable: true, get() { throw Error('private'); } });
  expect(appStateSnapshot()).toBe('unknown');
});
test.each([0, -1, 1001, 36.5, 'private-device', NaN])('rejects invalid API level %s', api => {
  Object.defineProperty(Platform, 'Version', { configurable: true, value: api });
  expect(startAndroidReadEvidence()).not.toHaveProperty('android_api_level');
});
test('unavailable native API level is omitted', () => {
  Object.defineProperty(Platform, 'Version', { configurable: true, get() { throw Error('private'); } });
  expect(startAndroidReadEvidence()).not.toHaveProperty('android_api_level');
});
test.each(['ios', 'web'])('%s records no additional fields and never wraps a response', async os => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  expect(startAndroidReadEvidence()).toEqual({});
  const controller = new AbortController(), response = new Response('[]');
  const text = response.text;
  global.fetch = jest.fn().mockResolvedValue(response);
  beginReadDiagnostics(controller.signal, 'supabase');
  expect(await observedMemberFetch('https://synthetic.invalid', { signal: controller.signal })).toBe(response);
  expect(response.text).toBe(text);
  const error = Error('private'); finishReadDiagnostics(controller.signal, error);
  expect(readFailureDiagnostics(error)).not.toHaveProperty('diagnostics_version');
});

test('real SDK error preserves phase, lifecycle, method and safe correlation without body content', async () => {
  global.fetch = jest.fn().mockImplementation(async () => {
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' });
    return new Response('private server message', { status: 504, headers: {
      'x-doji-native-read-version': '1', 'x-doji-native-response-source': 'network',
      'sb-request-id': '8352115d-a43b-4c75-b65e-222037e846a4',
    } });
  });
  const error = await runMemberRead(sdk().from('private-table').select('id')).catch(e => e);
  const detail = readFailureDiagnostics(error);
  expect(detail).toMatchObject({ diagnostics_version: 2, android_api_level: 36, app_state_start: 'active',
    app_state_failure: 'background', fetch_invocations: 1, request_method: 'GET', body_state: 'complete', response_status: 504 });
  const summary = summarizeAndroidReadFailure(detail!);
  expect(summary).toMatchObject({ failure_evidence: 'network_http_response', failure_phase: 'after_body' });
  expect(JSON.stringify(normalize({ api: { ...detail, ...summary } }, 3))).not.toMatch(/private|\[Object\]|Supabase.*caused/);
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('body deadline snapshots reading, and late completion cannot rewrite evidence', async () => {
  jest.useFakeTimers(); let release!: (value: string) => void;
  global.fetch = jest.fn().mockResolvedValue({ status: 200, ok: true, headers: new Headers(),
    text: () => new Promise(resolve => { release = resolve; }) });
  const pending = runMemberRead(sdk().from('records').select('id'), undefined, 100).catch(e => e);
  await jest.advanceTimersByTimeAsync(100);
  const error = await pending, detail = readFailureDiagnostics(error);
  expect(detail).toMatchObject({ body_state: 'reading', response_status: 200 });
  expect(summarizeAndroidReadFailure({ ...detail, abort_source: error.abortSource }))
    .toMatchObject({ failure_evidence: 'client_deadline', failure_phase: 'body_read' });
  release('[]'); await jest.advanceTimersByTimeAsync(0);
  expect(readFailureDiagnostics(error)).toEqual(detail);
  expect(jest.getTimerCount()).toBe(0);
});

test('body reader preserves thrown exception identity and observes rejection', async () => {
  const failure = new TypeError('private body problem');
  const response = { text: () => Promise.reject(failure) } as unknown as Response;
  const update = jest.fn(); observeAndroidReadBody(response, update);
  await expect(response.text()).rejects.toBe(failure);
  expect(update).toHaveBeenLastCalledWith({ body_state: 'rejected', body_read_ms: expect.any(Number) });
});
test('JSON parse failure is observed without retaining payload', async () => {
  const response = new Response('private non-JSON'), update = jest.fn();
  observeAndroidReadBody(response, update);
  await expect(response.json()).rejects.toMatchObject({ name: 'SyntaxError' });
  expect(update).toHaveBeenLastCalledWith({ body_state: 'rejected', body_read_ms: expect.any(Number) });
  expect(JSON.stringify(update.mock.calls)).not.toContain('private');
});
test('synchronous reader failure is unchanged', () => {
  const failure = new Error('private'); const response = { text() { throw failure; } } as unknown as Response;
  const update = jest.fn(); observeAndroidReadBody(response, update);
  expect(() => response.text()).toThrow(failure);
  expect(update).toHaveBeenLastCalledWith({ body_state: 'rejected', body_read_ms: expect.any(Number) });
});
test('borrowed text method retains its receiver and does not record the other body', async () => {
  const response = new Response('first'), second = new Response('second'), update = jest.fn();
  observeAndroidReadBody(response, update);
  await expect(response.text.call(second)).resolves.toBe('second');
  expect(response.bodyUsed).toBe(false); expect(update).toHaveBeenCalledTimes(1);
});
test.each(['frozen', 'fixed-method', 'no-method', 'throwing-getter'])('optional observer safely declines %s response', kind => {
  const original = () => Promise.resolve('[]'); const response: any = { text: original };
  if (kind === 'frozen') Object.freeze(response);
  if (kind === 'fixed-method') Object.defineProperty(response, 'text', { configurable: false, value: original });
  if (kind === 'no-method') delete response.text;
  if (kind === 'throwing-getter') Object.defineProperty(response, 'json', { get() { throw Error('private'); } });
  const update = jest.fn(); expect(() => observeAndroidReadBody(response, update)).not.toThrow();
  expect(update).toHaveBeenLastCalledWith({ body_state: 'unavailable' });
  if (kind !== 'no-method') expect(response.text).toBe(original);
});
test('observer exceptions cannot replace successful response data', async () => {
  const response = new Response('[]'); observeAndroidReadBody(response, () => { throw Error('telemetry'); });
  await expect(response.text()).resolves.toBe('[]');
});
test.each([-100, 900000])('body durations are bounded for clock movement %s', delta => {
  let clock = 1000; jest.spyOn(Date, 'now').mockImplementation(() => clock);
  const response = { text: () => { clock += delta; throw Error('synthetic'); } } as unknown as Response;
  const update = jest.fn(); observeAndroidReadBody(response, update);
  expect(() => response.text()).toThrow();
  expect(update).toHaveBeenLastCalledWith({ body_state: 'rejected', body_read_ms: delta < 0 ? 0 : 120000 });
});
test('second fetch drops old response hints; old body settlement cannot rewrite latest attempt', async () => {
  const controller = new AbortController(); let release!: (v: string) => void;
  const old = { status: 401, headers: new Headers(), text: () => new Promise<string>(r => { release = r; }) } as Response;
  global.fetch = jest.fn().mockResolvedValueOnce(old).mockResolvedValueOnce(new Response('', { status: 504 }));
  beginReadDiagnostics(controller.signal, 'scale_gateway');
  const first = await observedMemberFetch('https://synthetic.invalid', { signal: controller.signal });
  const body = first.text();
  await observedMemberFetch('https://synthetic.invalid', { signal: controller.signal });
  release('private old body'); await body;
  const error = Error('synthetic'); finishReadDiagnostics(controller.signal, error);
  expect(readFailureDiagnostics(error)).toMatchObject({ fetch_invocations: 2, body_state: 'unread', response_status: 504 });
});
test.each([
  [{ status: 504, native_response_source: 'local_cache_miss' }, 'local_cache_miss', 'unknown'],
  [{ response_status: 504, native_response_source: 'cache' }, 'cached_http_response', 'unknown'],
  [{ response_status: 504, stage: 'headers' }, 'http_response_origin_unknown', 'after_headers'],
  [{ response_status: 200, abort_source: 'deadline', body_state: 'reading' }, 'client_deadline', 'body_read'],
  [{ stage: 'fetch_rejected' }, 'fetch_rejected', 'fetch'],
  [{ stage: 'fetch', abort_source: 'deadline' }, 'client_deadline', 'fetch'],
  [{ stage: 'before_fetch', abort_source: 'deadline' }, 'client_deadline', 'before_fetch'],
  [{ body_state: 'rejected', response_status: 200 }, 'unclassified', 'body_read_rejected'],
  [{}, 'unclassified', 'unknown'],
] as const)('summary states only observed facts (%j)', (data, evidence, phase) => {
  expect(summarizeAndroidReadFailure(data)).toMatchObject({ failure_evidence: evidence, failure_phase: phase });
});
