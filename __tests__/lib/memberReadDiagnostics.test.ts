import { createClient } from '@supabase/supabase-js';
import { QueryClient, QueryObserver, focusManager } from '@tanstack/react-query';
import * as Sentry from '@sentry/react-native';
import { normalize } from '@sentry/core';
import { Platform } from 'react-native';
import { runMemberRead } from '../../lib/runMemberRead';
import { boundedSupabaseFetch } from '../../lib/supabaseFetch';
import { readFailureDiagnostics } from '../../lib/memberReadDiagnostics';
import { createApiQueryCache } from '../../lib/apiQueryCache';
import { shouldRetryQuery } from '../../lib/apiRetry';
import { rpcQueryError } from '../../lib/rpcQueryError';
import { sanitizeApiFailureEvent } from '../../lib/apiFailureTelemetry';

const mockScope = { setTag: jest.fn(), setContext: jest.fn(), setFingerprint: jest.fn() };
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(), addBreadcrumb: jest.fn(), captureException: jest.fn(),
  withScope: (callback: any) => callback(mockScope),
}));
const originalFetch = global.fetch;
const originalDev = __DEV__;
const originalController = global.AbortController;
const originalPlatform = Platform.OS;
let clock = 1_900_000_000_000;
const sbId = '8352115d-a43b-4c75-b65e-222037e846a4';
const otherId = 'e0ac21a5-dc4d-49ed-8fc2-1b5d79f01660';
const db = () => createClient('https://local.test', 'private-api-key', {
  accessToken: async () => 'private-token', global: { fetch: boundedSupabaseFetch },
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const read = (signal?: AbortSignal, timeout = 8000) => runMemberRead(db().from('private-table').select('id').eq('user_id', 'private-user'), signal, timeout);
const failure = (requestId = sbId, status = 504) => new Response('private response', {
  status, headers: { 'sb-request-id': requestId, 'cf-ray': '9abc1234def56789-DEN',
    'content-type': 'text/html; charset=utf-8', 'cf-cache-status': 'DYNAMIC',
    'set-cookie': 'private-cookie', authorization: 'private-token' },
});
const client = () => new QueryClient({ queryCache: createApiQueryCache(), defaultOptions: {
  queries: { retry: shouldRetryQuery, retryDelay: 1, gcTime: 0 },
} });
beforeEach(() => {
  jest.clearAllMocks(); (global as any).__DEV__ = false;
  global.AbortController = require('abort-controller').AbortController;
  clock += 120_000; jest.spyOn(Date, 'now').mockImplementation(() => clock);
});
afterEach(() => {
  global.fetch = originalFetch; global.AbortController = originalController;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
  (global as any).__DEV__ = originalDev; focusManager.setFocused(true);
  jest.restoreAllMocks(); jest.useRealTimers();
});

test('captures only validated response hints with unchanged request/response behavior', async () => {
  global.fetch = jest.fn().mockResolvedValue(failure());
  const error = await read().catch(error => error);
  expect(error).toMatchObject({ status: 504, abortSource: 'none' });
  expect(readFailureDiagnostics(error)).toEqual({ transport: 'supabase', stage: 'headers',
    dispatch_ms: 0, headers_ms: 0, response_status: 504, sb_request_id: sbId,
    cf_ray: '9abc1234def56789-DEN', response_type: 'html', cache_status: 'DYNAMIC', cache_only_signature: false });
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toContain('user_id=eq.private-user');
  expect(init.headers.get('authorization')).toBe('Bearer private-token');
  expect(init.headers.get('cache-control')).toBeNull();
  expect(readFailureDiagnostics(rpcQueryError(error))).toEqual(readFailureDiagnostics(error));
  expect(JSON.stringify(readFailureDiagnostics(error))).not.toMatch(/private/);
});

test('malformed identifiers and arbitrary header values are never retained', async () => {
  global.fetch = jest.fn().mockResolvedValue(new Response('private body', { status: 504,
    headers: { 'sb-request-id': 'private-email@example.com', 'cf-ray': 'private-token',
      'cf-cache-status': 'private-text', 'content-type': 'private-content' } }));
  const detail = readFailureDiagnostics(await read().catch(error => error));
  expect(detail).toMatchObject({ response_type: 'other' });
  expect(detail).not.toHaveProperty('sb_request_id'); expect(detail).not.toHaveProperty('cf_ray');
  expect(JSON.stringify(detail)).not.toContain('private');
});

test('native cache-only signature is distinguished without inferring a provider cause', async () => {
  global.fetch = jest.fn().mockResolvedValue(new Response('', { status: 504, statusText: 'Unsatisfiable Request (only-if-cached)' }));
  expect(readFailureDiagnostics(await read().catch(error => error))).toMatchObject({ cache_only_signature: true, response_status: 504 });
});

test('concurrent, out-of-order failures cannot exchange request IDs', async () => {
  const releases: ((response: Response) => void)[] = [];
  global.fetch = jest.fn().mockImplementation(() => new Promise(resolve => { releases.push(resolve); }));
  const first = read().catch(error => error), second = read().catch(error => error);
  for (let i = 0; i < 12 && releases.length < 2; i++) await Promise.resolve();
  expect(releases).toHaveLength(2);
  releases[1](failure(otherId)); releases[0](failure(sbId));
  expect(readFailureDiagnostics(await first)?.sb_request_id).toBe(sbId);
  expect(readFailureDiagnostics(await second)?.sb_request_id).toBe(otherId);
});

test('two real SDK attempts produce one incident retaining both attempts, not private fields', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce(failure(sbId)).mockResolvedValueOnce(failure(otherId));
  const c = client();
  try {
    await expect(c.fetchQuery({ queryKey: ['mySuggestions', 'private-user'], queryFn: ({ signal }) => read(signal) })).rejects.toMatchObject({ status: 504 });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    const context = mockScope.setContext.mock.calls[0][1];
    expect(context).toMatchObject({ attempt_count: 2, sb_request_id: otherId,
      attempts: [{ sb_request_id: sbId }, { sb_request_id: otherId }] });
    const event: any = { tags: { area: 'api' }, contexts: { api: context, device: { name: 'private-device' } },
      request: { url: 'private-url' }, user: { id: 'private-user' }, extra: { token: 'private-token' }, breadcrumbs: [{ message: 'private' }] };
    expect(JSON.stringify(sanitizeApiFailureEvent(event, {}))).not.toContain('private');
  } finally { c.clear(); }
});

test('Android first/final evidence survives the installed Sentry default normalization depth', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  global.fetch = jest.fn().mockResolvedValueOnce(failure(sbId))
    .mockResolvedValueOnce(new Response(null, { status: 504, headers: {
      'x-doji-native-read-version': '2', 'x-doji-native-response-source': 'network',
      'x-doji-native-request-cache-only': 'false',
      'x-doji-native-protocol': 'h2', 'x-doji-native-network-headers-ms': '236', 'x-doji-native-prior-response-count': '0',
    } }));
  const c = client();
  try {
    await expect(c.fetchQuery({ queryKey: ['ownedShopItems', 'private-user'], queryFn: ({ signal }) => read(signal) }))
      .rejects.toMatchObject({ status: 504 });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    const context = mockScope.setContext.mock.calls[0][1];
    // prepareEvent normalizes the complete contexts map at depth 3 before beforeSend.
    // The original contexts.api.attempts[].fields payload loses the objects here.
    expect(normalize({ api: { attempts: [{ status: 504 }] } }, 3))
      .toEqual({ api: { attempts: ['[Object]'] } });
    const normalized = normalize({ api: context }, 3);
    expect(normalized).toMatchObject({ api: { attempt_count: 2,
      first_attempt: { response_status: 504, sb_request_id: sbId, status_text_available: false },
      response_status: 504, status_text_available: false, response_type: 'missing',
      native_response_source: 'network', native_request_cache_only: false } });
    expect(normalized).toMatchObject({ api: { failure_evidence: 'network_http_response', failure_phase: 'after_body',
      diagnostics_version: 2, fetch_invocations: 1, body_state: 'complete',
      native_protocol: 'h2', native_network_headers_ms: 236, native_prior_response_count: 0,
      first_attempt: { diagnostics_version: 2, body_state: 'complete' } } });
    expect((Sentry.captureException as jest.Mock).mock.calls[0][0].message)
      .toBe('Doji query.ownedShopItems failed (timeout; network HTTP response 504; phase=after_body)');
    expect(mockScope.setTag).toHaveBeenCalledWith('failure_evidence', 'network_http_response');
    // Detailed text changes, existing grouping and volume controls do not.
    expect(mockScope.setFingerprint).toHaveBeenCalledWith(['api', 'query', 'ownedShopItems', 'timeout', '504']);
    expect(context).not.toHaveProperty('attempts');
    expect(context).not.toHaveProperty('cache_only_signature');
    expect(context).not.toHaveProperty('sb_request_id');
    const event: any = { tags: { area: 'api' }, contexts: normalized, request: { url: 'private-url' },
      user: { id: 'private-user' }, extra: { token: 'private-token' }, breadcrumbs: [{ message: 'private' }] };
    expect(JSON.stringify(sanitizeApiFailureEvent(event, {}))).not.toMatch(/private|\[Object\]/);
  } finally { c.clear(); }
});

test('Android single-attempt failures do not invent first-retry evidence', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  global.fetch = jest.fn().mockResolvedValue(failure());
  const c = client();
  try {
    await expect(c.fetchQuery({ queryKey: ['ownedShopItems'], retry: false, queryFn: ({ signal }) => read(signal) }))
      .rejects.toMatchObject({ status: 504 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const context = mockScope.setContext.mock.calls[0][1];
    expect(context).toMatchObject({ attempt_count: 1, sb_request_id: sbId });
    expect(context).not.toHaveProperty('attempts');
    expect(context).not.toHaveProperty('first_attempt');
  } finally { c.clear(); }
});

test.each(['504', 'network'])('transient %s recovers with exactly one retry and no incident', async kind => {
  global.fetch = kind === 'network' ? jest.fn().mockRejectedValueOnce(new TypeError('Network request failed'))
    .mockResolvedValueOnce(new Response('[]', { status: 200 })) : jest.fn().mockResolvedValueOnce(failure())
    .mockResolvedValueOnce(new Response('[]', { status: 200 }));
  const c = client();
  try {
    await expect(c.fetchQuery({ queryKey: ['comments'], queryFn: ({ signal }) => read(signal) })).resolves.toMatchObject({ data: [] });
    expect(global.fetch).toHaveBeenCalledTimes(2); expect(Sentry.captureException).not.toHaveBeenCalled();
  } finally { c.clear(); }
});

test('a manual refetch starts a fresh sequence and keeps cached data while requests recover', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce(failure()).mockResolvedValueOnce(failure())
    .mockResolvedValueOnce(new Response('[{"id":"recovered"}]', { status: 200 }));
  const c = client();
  const observer = new QueryObserver(c, { queryKey: ['friends'], enabled: false, initialData: { data: [{ id: 'cached' }], error: null },
    queryFn: ({ signal }) => read(signal) });
  try {
    expect((await observer.refetch()).data).toMatchObject({ data: [{ id: 'cached' }] });
    expect((await observer.refetch({ cancelRefetch: false })).data).toMatchObject({ data: [{ id: 'recovered' }] });
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  } finally { observer.destroy(); c.clear(); }
});

test.each([401, 403])('authorization %s is never retried', async status => {
  global.fetch = jest.fn().mockImplementation(async () => failure(sbId, status));
  const c = client();
  try {
    await expect(c.fetchQuery({ queryKey: ['mySuggestions'], queryFn: ({ signal }) => read(signal) })).rejects.toMatchObject({ status });
    expect(global.fetch).toHaveBeenCalledTimes(1); expect(Sentry.captureException).not.toHaveBeenCalled();
  } finally { c.clear(); }
});

test('headers survive a stalled body deadline; a late body cannot change captured evidence', async () => {
  jest.useFakeTimers(); let release!: (body: string) => void;
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers({ 'sb-request-id': sbId }),
    text: () => new Promise(resolve => { release = resolve; }) });
  const pending = read(undefined, 100).catch(error => error);
  await jest.advanceTimersByTimeAsync(100);
  const error = await pending;
  expect(error).toMatchObject({ name: 'TimeoutError', abortSource: 'deadline' });
  expect(readFailureDiagnostics(error)).toMatchObject({ stage: 'headers', response_status: 200, sb_request_id: sbId });
  release('[]'); await jest.advanceTimersByTimeAsync(0);
  expect(await pending).toBe(error); expect(jest.getTimerCount()).toBe(0);
});

test('header inspection failure cannot turn a successful response into a query error', async () => {
  // PostgREST needs content-range, so fail only the diagnostic header lookup.
  const response = new Response('[]', { status: 200 });
  const get = response.headers.get.bind(response.headers);
  jest.spyOn(response.headers, 'get').mockImplementation(name => { if (name === 'sb-request-id') throw Error('bad header'); return get(name); });
  global.fetch = jest.fn().mockResolvedValue(response);
  await expect(read()).resolves.toMatchObject({ data: [], error: null });
});

test('background pauses the existing retry; foreground resumes it without an extra retry loop', async () => {
  jest.useFakeTimers();
  global.fetch = jest.fn().mockImplementationOnce(async () => {
    focusManager.setFocused(false); return failure();
  }).mockResolvedValueOnce(new Response('[]', { status: 200 }));
  const c = client(); c.mount();
  try {
    const pending = c.fetchQuery({ queryKey: ['mySuggestions'], queryFn: ({ signal }) => read(signal) });
    await jest.advanceTimersByTimeAsync(1000);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(c.getQueryState(['mySuggestions'])?.fetchStatus).toBe('paused');
    focusManager.setFocused(true); await jest.advanceTimersByTimeAsync(0);
    await expect(pending).resolves.toMatchObject({ data: [] });
    expect(global.fetch).toHaveBeenCalledTimes(2); expect(Sentry.captureException).not.toHaveBeenCalled();
  } finally { c.unmount(); c.clear(); }
});

test('account/query cancellation during backoff stops retry and cannot install late data', async () => {
  jest.useFakeTimers();
  global.fetch = jest.fn().mockImplementation(async () => failure());
  const c = client();
  try {
    const pending = c.fetchQuery({ queryKey: ['mySuggestions', 'old-account'], retryDelay: 1000,
      queryFn: ({ signal }) => read(signal) }).catch(error => error);
    await jest.advanceTimersByTimeAsync(10);
    await c.cancelQueries(); await jest.advanceTimersByTimeAsync(2000); await pending;
    expect(global.fetch).toHaveBeenCalledTimes(1); expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(c.getQueryData(['mySuggestions', 'old-account'])).toBeUndefined();
  } finally { c.clear(); }
});
