import { AppState, Platform } from 'react-native';
import { normalize } from '@sentry/core';
import { QueryClient } from '@tanstack/react-query';
import { createApiQueryCache } from '../../lib/apiQueryCache';
import { safeDiagnosticEndpoint } from '../../lib/diagnosticOperations';
import * as Sentry from '@sentry/react-native';
import { beginReadDiagnostics, finishReadDiagnostics, inheritReadDiagnostics, observedMemberFetch,
  readDiagnosticContext, readFailureDiagnostics } from '../../lib/memberReadDiagnostics';
import { reportApiFailure, sanitizeApiFailureEvent } from '../../lib/apiFailureTelemetry';
import { initializeDiagnosticInstallation, mobileDiagnosticSnapshot, observeDiagnosticNetwork,
  setDiagnosticActor, setDiagnosticScreen, observeDiagnosticAppState, diagnosticTimeline } from '../../lib/mobileDiagnosticContext';

const mockScope = { setTag: jest.fn(), setContext: jest.fn(), setFingerprint: jest.fn() };
jest.mock('@sentry/react-native', () => ({ addBreadcrumb: jest.fn(), captureException: jest.fn(),
  withScope: (callback: (scope: typeof mockScope) => void) => callback(mockScope) }));
const originalOS = Platform.OS, originalFetch = global.fetch, originalDev = __DEV__;
let now = 2_000_000_000_000;
beforeEach(async () => {
  jest.clearAllMocks(); (global as any).__DEV__ = false;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  now += 1_000_000; jest.spyOn(Date, 'now').mockImplementation(() => now);
  await initializeDiagnosticInstallation(); setDiagnosticActor(`private-actor-${now}`);
  setDiagnosticScreen(['(app)', '(tabs)']); observeDiagnosticAppState('active');
  observeDiagnosticNetwork({ type: 'WIFI', isConnected: true, isInternetReachable: true });
});
afterEach(() => { jest.restoreAllMocks(); global.fetch = originalFetch; (global as any).__DEV__ = originalDev;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS }); });

test.each(['ios', 'android'])('request evidence is correlated, bounded, normalization-safe and content-free (%s)', async platform => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
  const a = new AbortController(), b = new AbortController();
  beginReadDiagnostics(a.signal, 'supabase'); beginReadDiagnostics(b.signal, 'supabase');
  global.fetch = jest.fn().mockResolvedValue(new Response('private-body', { status: 504 }));
  const response = await observedMemberFetch('https://private.invalid/?secret=private', { signal: a.signal, method: 'POST' });
  await response.text();
  setDiagnosticScreen(['(app)', 'profile', 'shop']); observeDiagnosticAppState('background');
  observeDiagnosticNetwork({ type: 'CELLULAR', isConnected: false });
  now += 130_000;
  const error = { status: 504, message: 'private message' };
  finishReadDiagnostics(a.signal, error); finishReadDiagnostics(b.signal);
  expect(readFailureDiagnostics(error)).toMatchObject({ in_flight_start: 1, in_flight_end: 1, elapsed_capped: true });
  expect(readDiagnosticContext(error)).toMatchObject({ screen: '(app)/(tabs)', screen_at_settlement: '(app)/profile/shop',
    network_type: 'WIFI', network_type_at_settlement: 'CELLULAR', network_changes_during_request: 1,
    lifecycle_changes_during_request: 1, wall_elapsed_ms: 130000 });
  reportApiFailure('query', 'feed', error);
  const contexts = normalize(Object.fromEntries(mockScope.setContext.mock.calls), 3);
  const event: any = { tags: { area: 'api' }, contexts: { ...contexts, device: { model: 'Pixel 9', id: 'private', name: 'private' },
    os: { name: 'Android', version: '16' }, arbitrary: { private: true } }, user: { id: 'private' },
    extra: { private: true }, request: { headers: { authorization: 'private' } }, breadcrumbs: [{ message: 'private' }] };
  const sanitized: any = sanitizeApiFailureEvent(event, {});
  expect(sanitized.contexts.diagnostic.installation_id).toMatch(/^diag:/);
  expect(sanitized.contexts.device).toEqual({ model: 'Pixel 9' });
  expect(sanitized.contexts.diagnostic_step_0).toBeDefined();
  const serialized = JSON.stringify(sanitized);
  expect(serialized).not.toMatch(/private|\[Object\]/);
  expect(serialized.length).toBeLessThan(16000);
  expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  expect(mockScope.setFingerprint).toHaveBeenCalledWith(['api', 'query', 'feed', 'timeout', '504']);
});

test('late request/error conversion retains the original session and never attaches the new account timeline', () => {
  const signal = new AbortController().signal;
  const old = mobileDiagnosticSnapshot(); beginReadDiagnostics(signal, 'command_gateway');
  setDiagnosticActor('private-next-person'); setDiagnosticScreen(['(app)', 'friends', 'requests']);
  const raw = { status: 504 }, converted = { status: 504 };
  finishReadDiagnostics(signal, raw); inheritReadDiagnostics(raw, converted);
  expect(readDiagnosticContext(converted)).toMatchObject({ session_id: old.session_id, session_changed: true });
  expect(readDiagnosticContext(converted)).not.toHaveProperty('screen_at_settlement');
  reportApiFailure('command', 'request_friendship', converted);
  expect(mockScope.setContext.mock.calls.some(([key]) => key.startsWith('diagnostic_step_'))).toBe(false);
  expect(mockScope.setContext).toHaveBeenCalledWith('diagnostic', expect.objectContaining({ session_id: old.session_id }));
});

test('finished request snapshots cannot be rewritten by later screen/network changes', () => {
  const signal = new AbortController().signal, error = { status: 503 };
  beginReadDiagnostics(signal, 'supabase'); finishReadDiagnostics(signal, error);
  const before = readDiagnosticContext(error);
  setDiagnosticScreen(['(auth)', 'login']); observeDiagnosticNetwork({ type: 'NONE', isConnected: false });
  finishReadDiagnostics(signal, error);
  expect(readDiagnosticContext(error)).toEqual(before);
  expect(AppState).toBeDefined();
});

test('non-API JS errors receive explicitly processing-time diagnostics without replacing their exception', () => {
  const exception = { values: [{ type: 'TypeError', value: 'synthetic failure' }] };
  const result: any = sanitizeApiFailureEvent({ exception, tags: { area: 'startup' }, contexts: { os: { name: 'iOS' } } }, {});
  expect(result.exception).toBe(exception);
  expect(result.contexts.diagnostic).toMatchObject({ context_origin: 'event_processing_unattributed', platform: 'ios' });
  expect(result.contexts.os.name).toBe('iOS');
});

test('successful query retry records a local recovery, not a new Sentry event', async () => {
  const client = new QueryClient({ queryCache: createApiQueryCache(), defaultOptions: { queries: { retry: 1, retryDelay: 0, gcTime: 0 } } });
  let calls = 0;
  try {
    const result = await client.fetchQuery({ queryKey: ['feed', 'private-id'], queryFn: async () => {
      if (calls++ === 0) throw { status: 504, message: 'private' };
      return 'private-success-body';
    } });
    expect(result).toBe('private-success-body');
    expect(diagnosticTimeline().at(-1)?.data).toMatchObject({ operation: 'feed', outcome: 'recovered', attempts: 2 });
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(JSON.stringify(diagnosticTimeline())).not.toContain('private');
  } finally { client.clear(); }
});

test.each([
  ['https://private.invalid/rest/v1/rpc/get_current_doji_state?token=private', 'rpc:get_current_doji_state'],
  ['https://private.invalid/commands/rpc/complete_doji_with_post', 'rpc:complete_doji_with_post'],
  ['https://private.invalid/rest/v1/user_shop_items?user_id=eq.private', 'table:user_shop_items'],
  ['https://private.invalid/v1/profiles/private-person', 'scale:public_profile'],
  ['https://private.invalid/v1/feed/private-id?audience=private', 'scale:feed'],
  ['https://private.invalid/rest/v1/rpc/private_rpc', 'other'],
  ['private-invalid', 'other'],
])('endpoint labels cannot reveal hosts, params or identifiers: %s', (url, expected) => {
  expect(safeDiagnosticEndpoint(url)).toBe(expected);
});

test('response size/age/retry hints are numeric-only; cookies and arbitrary headers never enter evidence', async () => {
  const signal = new AbortController().signal, error = { status: 504 };
  beginReadDiagnostics(signal, 'supabase');
  global.fetch = jest.fn().mockResolvedValue(new Response('private', { status: 504, headers: {
    'content-length': '7', age: '10', 'retry-after': 'private', 'set-cookie': 'private' } }));
  await observedMemberFetch('https://private.invalid/rest/v1/user_shop_items', { signal });
  finishReadDiagnostics(signal, error);
  expect(readFailureDiagnostics(error)).toMatchObject({ response_content_length: 7, response_age_seconds: 10,
    endpoint: 'table:user_shop_items' });
  expect(readFailureDiagnostics(error)).not.toHaveProperty('retry_after_seconds');
  expect(JSON.stringify(readFailureDiagnostics(error))).not.toContain('private');
});
