import { AppState, Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { QueryClient } from '@tanstack/react-query';
import { normalize } from '@sentry/core';
import * as Sentry from '@sentry/react-native';
import { executeCommand } from '../../lib/commandGateway';
import { boundedSupabaseFetch } from '../../lib/supabaseFetch';
import { runMemberRead } from '../../lib/runMemberRead';
import { createApiQueryCache } from '../../lib/apiQueryCache';
import { shouldRetryQuery } from '../../lib/apiRetry';
import { apiAttemptDetails, sanitizeApiFailureEvent } from '../../lib/apiFailureTelemetry';

const mockScope = { setTag: jest.fn(), setContext: jest.fn(), setFingerprint: jest.fn() };
jest.mock('@sentry/react-native', () => ({ addBreadcrumb: jest.fn(), captureException: jest.fn(),
  withScope: (callback: (scope: typeof mockScope) => void) => callback(mockScope) }));
jest.mock('../../lib/supabase', () => ({ supabase: { auth: {
  getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'private-token' } } }),
} } }));
jest.mock('../../lib/releaseIdentity', () => ({ mobileReleaseIdentity: () => ({ platform: 'ios' }) }));

const originalFetch = global.fetch, originalOS = Platform.OS, originalState = AppState.currentState;
const originalDev = __DEV__, originalGateway = process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL;
let clock = 1_900_000_000_000;
const firstId = '8352115d-a43b-4c75-b65e-222037e846a4';
const lastId = 'e0ac21a5-dc4d-49ed-8fc2-1b5d79f01660';
const failure = (id = firstId) => new Response('private-body', { status: 504, headers: {
  'sb-request-id': id, 'cf-ray': '9abc1234def56789-DEN', 'content-type': 'text/html',
  // Never interpret Android-specific hints on iOS.
  'x-doji-native-read-version': '3', 'x-doji-native-response-source': 'network',
} });
beforeEach(() => {
  jest.clearAllMocks(); (global as any).__DEV__ = false;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL = 'https://synthetic.invalid';
  clock += 120_000; jest.spyOn(Date, 'now').mockImplementation(() => clock);
});
afterEach(() => {
  global.fetch = originalFetch; (global as any).__DEV__ = originalDev;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: originalState });
  if (originalGateway === undefined) delete process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL;
  else process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL = originalGateway;
  jest.restoreAllMocks(); jest.useRealTimers();
});

test('real SDK iOS retries retain first/final evidence through Sentry normalization and privacy filtering', async () => {
  const db = createClient('https://synthetic.invalid', 'private-key', {
    accessToken: async () => 'private-token', global: { fetch: boundedSupabaseFetch },
  });
  global.fetch = jest.fn().mockResolvedValueOnce(failure()).mockImplementationOnce(async () => {
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' });
    return failure(lastId);
  });
  const client = new QueryClient({ queryCache: createApiQueryCache(), defaultOptions: {
    queries: { retry: shouldRetryQuery, retryDelay: 1, gcTime: 0 },
  } });
  try {
    await expect(client.fetchQuery({ queryKey: ['userEvent', 'private-user'], queryFn: ({ signal }) =>
      runMemberRead(db.rpc('get_current_doji_state'), signal, 6000),
    })).rejects.toMatchObject({ status: 504 });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    const context = mockScope.setContext.mock.calls[0][1];
    const contexts = normalize({ api: context }, 3);
    expect(contexts).toMatchObject({ api: { attempt_count: 2, diagnostics_version: 2,
      sb_request_id: lastId, request_method: 'POST', body_state: 'complete',
      app_state_start: 'active', app_state_failure: 'background',
      failure_evidence: 'http_response_origin_unknown', failure_phase: 'after_body',
      first_attempt: { sb_request_id: firstId, request_method: 'POST', body_state: 'complete' },
    } });
    expect(context).not.toHaveProperty('native_response_source');
    expect(context).not.toHaveProperty('android_api_level');
    expect(context).not.toHaveProperty('attempts');
    expect(mockScope.setFingerprint).toHaveBeenCalledWith(['api', 'query', 'userEvent', 'timeout', '504']);
    const event: any = { tags: { area: 'api' }, contexts, user: { id: 'private-user' },
      request: { url: 'private-url' }, extra: { token: 'private-token' }, breadcrumbs: [{ message: 'private' }] };
    expect(JSON.stringify(sanitizeApiFailureEvent(event, {}))).not.toMatch(/private|\[Object\]/);
  } finally { client.clear(); }
});

test('iOS command deadline retains fetch phase and lifecycle without adding a replay', async () => {
  jest.useFakeTimers({ now: clock });
  global.fetch = jest.fn().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => {
      Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'inactive' });
      reject(Error('private native error'));
    });
  }));
  const pending = executeCommand('request_friendship', {} as never);
  await jest.advanceTimersByTimeAsync(12000);
  const result = await pending;
  expect(apiAttemptDetails(result.error)).toMatchObject({ abort_source: 'deadline', deadline_ms: 12000,
    stage: 'fetch_rejected', request_method: 'POST', app_state_start: 'active', app_state_failure: 'inactive' });
  expect(apiAttemptDetails(result.error)).not.toHaveProperty('response_status');
  expect(mockScope.setTag).toHaveBeenCalledWith('failure_evidence', 'client_deadline');
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test.each([true, false])('iOS keyed retry preserves payload, result and reporting (recovers=%s)', async recovers => {
  jest.useFakeTimers({ now: clock });
  global.fetch = jest.fn().mockResolvedValueOnce(failure()).mockImplementation(async () =>
    recovers ? new Response('{"ok":true}', { status: 200 }) : failure(lastId));
  const pending = executeCommand('request_friendship', {
    p_addressee_id: 'private-target', p_idempotency_key: 'private-intent',
  });
  await jest.advanceTimersByTimeAsync(250);
  const result = await pending;
  const calls = (global.fetch as jest.Mock).mock.calls;
  expect(calls).toHaveLength(2);
  expect(calls[0][1].body).toBe(calls[1][1].body);
  expect(calls[0][1].headers).toEqual(calls[1][1].headers);
  if (recovers) {
    expect(result).toEqual({ data: { ok: true }, error: null });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  } else {
    expect(result.error).toMatchObject({ status: 504 });
    expect(apiAttemptDetails(result.error)).toMatchObject({ transport: 'command_gateway',
      response_status: 504, sb_request_id: lastId, body_state: 'complete', abort_source: 'none' });
    expect(JSON.stringify(mockScope.setContext.mock.calls)).not.toMatch(/private|Bearer/);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  }
  expect(jest.getTimerCount()).toBe(0);
});
