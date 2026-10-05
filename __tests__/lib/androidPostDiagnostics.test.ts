import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { normalize } from '@sentry/core';
import { executeCommand } from '../../lib/commandGateway';
import { boundedSupabaseFetch } from '../../lib/supabaseFetch';
import { runMemberRead } from '../../lib/runMemberRead';
import { apiAttemptDetails, reportApiFailure } from '../../lib/apiFailureTelemetry';
import * as Sentry from '@sentry/react-native';
const mockScope = { setTag: jest.fn(), setContext: jest.fn(), setFingerprint: jest.fn() };
jest.mock('@sentry/react-native', () => ({ addBreadcrumb: jest.fn(), captureException: jest.fn(),
  withScope: (callback: (scope: typeof mockScope) => void) => callback(mockScope) }));
jest.mock('../../lib/supabase', () => ({ supabase: { auth: {
  getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'private-token' } } }),
} } }));
jest.mock('../../lib/releaseIdentity', () => ({ mobileReleaseIdentity: () => ({ platform: 'android' }) }));
jest.mock('../../lib/apiFailureTelemetry', () => ({
  ...jest.requireActual('../../lib/apiFailureTelemetry'),
  reportApiFailure: jest.fn(jest.requireActual('../../lib/apiFailureTelemetry').reportApiFailure),
}));
const originalFetch = global.fetch, originalPlatform = Platform.OS;
const originalDev = __DEV__;
const originalGateway = process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL;
const response = () => new Response('', { status: 504, statusText: 'Gateway Timeout', headers: {
  'x-doji-native-read-version': '3', 'x-doji-native-response-source': 'network',
  'x-doji-native-request-cache-only': 'false', 'x-doji-native-protocol': 'h2',
  'x-doji-native-network-headers-ms': '14', 'x-doji-native-prior-response-count': '0',
} });
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL = 'https://doji-orchestrator.faheygs.workers.dev';
});
afterEach(() => {
  (global as any).__DEV__ = originalDev;
  global.fetch = originalFetch;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
  if (originalGateway === undefined) delete process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL;
  else process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL = originalGateway;
  jest.useRealTimers();
});
test('actual Supabase POST RPC retains native provenance without changing dispatch', async () => {
  const db = createClient('https://tvixsmqxotuvyjqzmjla.supabase.co', 'private-key', {
    accessToken: async () => 'private-token', global: { fetch: boundedSupabaseFetch },
  });
  global.fetch = jest.fn().mockResolvedValue(response());
  const error = await runMemberRead(db.rpc('get_current_doji_state'), undefined, 6000).catch(e => e);
  expect(apiAttemptDetails(error)).toMatchObject({ request_method: 'POST', native_response_source: 'network',
    native_protocol: 'h2', native_network_headers_ms: 14, body_state: 'complete', status: 504 });
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect((global.fetch as jest.Mock).mock.calls[0][1].headers.get('authorization')).toBe('Bearer private-token');
});
test('unkeyed command failure retains POST/HTTP/body/native evidence with no replay', async () => {
  global.fetch = jest.fn().mockResolvedValue(response());
  // Defensive legacy/malformed caller: never authorize a retry without its key.
  const result = await executeCommand('request_friendship', { p_addressee_id: 'private-target' } as never);
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(result.error).toMatchObject({ status: 504, code: 'DOJI_COMMAND_ERROR' });
  const details = apiAttemptDetails(result.error);
  expect(normalize({ api: details }, 3)).toMatchObject({ api: { transport: 'command_gateway',
    request_method: 'POST', response_status: 504, native_response_source: 'network',
    native_network_headers_ms: 14, body_state: 'complete', abort_source: 'none', deadline_ms: 12000 } });
  expect(JSON.stringify(details)).not.toMatch(/private|Bearer|request_friendship/);
  expect(reportApiFailure).toHaveBeenCalledTimes(1);
});
test('command deadline is distinct from an HTTP response and preserves failure context', async () => {
  jest.useFakeTimers();
  global.fetch = jest.fn().mockImplementation((_url, init) => new Promise((_r, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('private native cancellation')));
  }));
  const pending = executeCommand('request_friendship', {} as never);
  await jest.advanceTimersByTimeAsync(12000);
  const result = await pending;
  expect(apiAttemptDetails(result.error)).toMatchObject({ abort_source: 'deadline', deadline_ms: 12000,
    transport: 'command_gateway', stage: 'fetch_rejected', request_method: 'POST' });
  expect(apiAttemptDetails(result.error)).not.toHaveProperty('response_status');
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});
test('iOS command result and single dispatch remain unchanged and exclude Android evidence', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  global.fetch = jest.fn().mockResolvedValue(response());
  const result = await executeCommand('request_friendship', {} as never);
  expect(result.error).toMatchObject({ status: 504, code: 'DOJI_COMMAND_ERROR' });
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(apiAttemptDetails(result.error)).not.toHaveProperty('native_response_source');
  expect(apiAttemptDetails(result.error)).not.toHaveProperty('diagnostics_version');
});
test('successful Android commands keep their exact result and emit no failure', async () => {
  global.fetch = jest.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
  const result = await executeCommand('request_friendship', {} as never);
  expect(result).toEqual({ data: { ok: true }, error: null });
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(reportApiFailure).not.toHaveBeenCalled();
});
test('real keyed friend command retains its bounded retry and final normalized Sentry evidence', async () => {
  jest.useFakeTimers();
  (global as any).__DEV__ = false;
  global.fetch = jest.fn().mockImplementation(async () => response());
  const pending = executeCommand('request_friendship', {
    p_addressee_id: 'private-target', p_idempotency_key: 'private-intent',
  });
  await jest.advanceTimersByTimeAsync(250);
  const result = await pending;
  expect(result.error).toMatchObject({ status: 504 });
  expect(global.fetch).toHaveBeenCalledTimes(2);
  const calls = (global.fetch as jest.Mock).mock.calls;
  expect(calls[0][1].body).toBe(calls[1][1].body);
  expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  const api = mockScope.setContext.mock.calls[0][1];
  expect(normalize({ api }, 3)).toMatchObject({ api: { request_method: 'POST',
    transport: 'command_gateway', native_response_source: 'network', response_status: 504 } });
  expect(mockScope.setTag).toHaveBeenCalledWith('failure_evidence', 'network_http_response');
  expect(JSON.stringify(mockScope.setContext.mock.calls)).not.toMatch(/private|Bearer/);
  expect(jest.getTimerCount()).toBe(0);
});
