import * as Sentry from '@sentry/react-native';
import { Platform } from 'react-native';
import { hasPendingPushRegistrationIncident, reportPushRegistrationRecovery } from '../../lib/pushRegistrationRecovery';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { apiFailureDetails, queryFailureOperation, reportApiFailure, sanitizeApiFailureEvent } from '../../lib/apiFailureTelemetry';
import { queryClient } from '../../lib/queryClient';
import { canKeepQueryDataOnError } from '../../lib/queryDisplayState';
import { rpcQueryError } from '../../lib/rpcQueryError';
const mockScope = { setTag: jest.fn(), setContext: jest.fn(), setFingerprint: jest.fn() };
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(), addBreadcrumb: jest.fn(), captureException: jest.fn(),
  logger: { info: jest.fn() },
  withScope: (callback: any) => callback(mockScope),
}));

const originalDev = __DEV__;
beforeEach(() => { jest.clearAllMocks(); (global as any).__DEV__ = false; jest.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000); });
afterEach(() => { (global as any).__DEV__ = originalDev; jest.restoreAllMocks(); queryClient.clear(); });

test('terminal database failures preserve SQLSTATE, omit private content and dedupe the same exception', () => {
  const error = { code: '57014', status: 500, message: 'private report body and secret token', details: 'private SQL' };
  reportApiFailure('command', 'submit_policy_report', error);
  reportApiFailure('mutation', 'other', error);
  expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  expect(mockScope.setContext).toHaveBeenCalledWith('api', { kind: 'timeout', status: 500, code: '57014', error_type: 'api_object' });
  expect((Sentry.captureException as jest.Mock).mock.calls[0][0].message).not.toContain('private');
});

test.each([{ status: 401 }, { status: 403 }, { status: 429 }, { code: 'P0001' },
  { code: '23505' }, new Error('Network request failed'), { name: 'AbortError' }])('expected failure is not an incident: %j', error => {
  reportApiFailure('query', 'comments', error);
  expect(Sentry.captureException).not.toHaveBeenCalled();
});

test('query cache captures a failed read once despite two mounted observers', async () => {
  const options = { queryKey: ['comments', 'private-post', 'private-user'], retry: false,
    queryFn: async () => { throw { status: 500, code: 'XX000', message: 'private body' }; } };
  const a = new QueryObserver(queryClient, options);
  const b = new QueryObserver(queryClient, options);
  const offA = a.subscribe(() => {}), offB = b.subscribe(() => {});
  await a.refetch();
  expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(mockScope.setTag.mock.calls)).not.toContain('private');
  offA(); offB(); a.destroy(); b.destroy();
});

test('per-operation cooldown and total budget bound an error storm', () => {
  jest.spyOn(Date, 'now').mockReturnValue(1_800_000_120_000);
  for (let n = 0; n < 100; n++) reportApiFailure('command', 'submit_comment', { status: 503 });
  expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  for (let n = 0; n < 100; n++) reportApiFailure('query', `test-operation-${n}`, { status: 503 });
  expect(Sentry.captureException).toHaveBeenCalledTimes(10);
});

test('beforeSend removes ambient sensitive fields on handled API events', () => {
  const event: any = { tags: { area: 'api' }, request: { headers: { authorization: 'secret' } },
    user: { email: 'private@test.invalid' }, extra: { notes: 'private' }, breadcrumbs: [{ message: 'private URL' }],
    contexts: { api: { kind: 'server', status: 503 }, unrelated: { secret: true } } };
  const result = sanitizeApiFailureEvent(event, {});
  expect(JSON.stringify(result)).not.toMatch(/secret|private|unrelated/);
  expect(queryFailureOperation(['not-allowlisted-user-input'])).toBe('other');
  expect(apiFailureDetails({ code: 'sensitive-not-a-code' }).code).toBeUndefined();
});

test.each(['upcomingDoji', 'appAnnouncement', 'userBadges', 'badgeCategories', 'badgeTiers',
  'userBadgeProgress', 'challengeSuggestionCounts', 'pollVotesCount', 'reactionsGiven', 'profileFriends',
  'mySuggestions', 'pendingSuggestions', 'shopCatalog', 'ownedShopItems', 'isBlocked', 'admin'])
('known query root is actionable without private key segments: %s', root => {
  expect(queryFailureOperation([root, 'private-user-id', { private: 'content' }])).toBe(root);
});

test('unexpected failures retain a safe exception type without raw details', () => {
  jest.spyOn(Date, 'now').mockReturnValue(1_800_001_000_000);
  reportApiFailure('query', 'upcomingDoji', new TypeError('private details'));
  expect(mockScope.setContext).toHaveBeenCalledWith('api', expect.objectContaining({ error_type: 'TypeError' }));
  reportApiFailure('query', 'appAnnouncement', { name: 'private-user-name', message: 'private content' });
  expect(mockScope.setContext.mock.calls.filter(([name]) => name === 'api').at(-1)[1]).toMatchObject({ error_type: 'api_object' });
  expect(JSON.stringify(mockScope.setContext.mock.calls)).not.toContain('private');
});

test.each([new Error('Request timed out'), { status: 503 }, { status: 429 }, { code: '57014' }])('cached comments survive a transient error: %j', error => {
  expect(canKeepQueryDataOnError({ pages: [[]] }, error)).toBe(true);
  expect(canKeepQueryDataOnError(undefined, error)).toBe(false);
});

test.each([{ status: 403, message: 'timeout' }, { status: 401 }, { code: '42501' }, new Error('unclassified')])('cached comments fail closed: %j', error => {
  expect(canKeepQueryDataOnError({ pages: [[{ id: 'comment' }]] }, error)).toBe(false);
});

test('a failed refresh retains actual query data for the presentation decision', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const observer = new QueryObserver(client, { queryKey: ['comments'], enabled: false,
    initialData: ['existing-comment'], queryFn: async (): Promise<string[]> => { throw new Error('Request timed out'); } });
  const result = await observer.refetch();
  expect(result.isError).toBe(true);
  expect(canKeepQueryDataOnError(result.data, result.error)).toBe(true);
  expect(result.data).toEqual(['existing-comment']);
  observer.destroy(); client.clear();
});

test('SDK deadline failures remain incidents with content-free request diagnostics', () => {
  jest.spyOn(Date, 'now').mockReturnValue(1_800_002_000_000);
  const error = rpcQueryError({ message: 'private body', hint: 'private SQL', code: '' }, {
    status: 0, abortSource: 'deadline', timeoutMs: 6000,
  });
  reportApiFailure('query', 'upcomingDoji', error);
  expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  expect(mockScope.setContext).toHaveBeenCalledWith('api', {
    kind: 'timeout', status: undefined, code: undefined, error_type: 'TimeoutError',
    abort_source: 'deadline', response_received: false,
    failure_evidence: 'client_deadline', failure_phase: 'unknown',
    summary: 'client deadline reached; phase=unknown',
  });
  expect(JSON.stringify(mockScope.setContext.mock.calls)).not.toContain('private');
  expect((Sentry.captureException as jest.Mock).mock.calls[0][0].message).toBe('Doji query.upcomingDoji failed (timeout; client deadline reached; phase=unknown)');
});

test('known lifecycle cancellations remain silent, but unexplained SDK aborts do not', () => {
  jest.spyOn(Date, 'now').mockReturnValue(1_800_003_000_000);
  reportApiFailure('query', 'upcomingDoji', rpcQueryError({ message: 'AbortError' }, { status: 0, abortSource: 'parent' }));
  expect(Sentry.captureException).not.toHaveBeenCalled();
  expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
  reportApiFailure('query', 'upcomingDoji', rpcQueryError({ name: 'AbortError', message: 'Aborted' }, { status: 0, abortSource: null }));
  expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  expect(mockScope.setContext).toHaveBeenCalledWith('api', expect.objectContaining({
    kind: 'unexpected', abort_source: 'none', response_received: false,
  }));
});

test('arbitrary request metadata never leaves the device', () => {
  jest.spyOn(Date, 'now').mockReturnValue(1_800_004_000_000);
  reportApiFailure('query', 'upcomingDoji', {
    abortSource: 'private-url', status: 'private-status', message: 'private-message',
    request: { body: 'private-member' },
  });
  expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(mockScope.setContext.mock.calls)).not.toContain('private');
});

test('request timing is numeric, bounded and contains no identity or raw messages', () => {
  jest.spyOn(Date, 'now').mockReturnValue(1_800_005_000_000);
  reportApiFailure('query', 'comments', {
    name: 'TimeoutError', elapsedMs: 8000.2, timeoutMs: 8000, message: 'private URL',
  });
  expect(mockScope.setContext).toHaveBeenCalledWith('api', expect.objectContaining({ elapsed_ms: 8000, deadline_ms: 8000 }));
  reportApiFailure('query', 'friendship', { status: 503, elapsedMs: 99999999, timeoutMs: 'private-token' });
  const api = mockScope.setContext.mock.calls.filter(([name]) => name === 'api').at(-1)[1];
  expect(api).toMatchObject({ elapsed_ms: 120000 });
  expect(api).not.toHaveProperty('deadline_ms');
  expect(JSON.stringify(mockScope.setContext.mock.calls)).not.toContain('private');
});

test.each(['ios', 'android'] as const)('%s retains the actual Sentry event ID for a later confirmed recovery', os => {
  const originalOS = Platform.OS;
  Platform.OS = os;
  jest.spyOn(Date, 'now').mockReturnValue(os === 'ios' ? 1_900_000_000_000 : 1_900_000_120_000);
  const id = '997e12597a43431dada72dab52b4ba91';
  (Sentry.captureException as jest.Mock).mockReturnValueOnce(id);
  try {
    reportApiFailure('command', 'register_native_push_endpoint_v3', { name: 'TimeoutError' });
    expect(hasPendingPushRegistrationIncident()).toBe(true);
    expect(Sentry.logger.info).not.toHaveBeenCalled();
    reportPushRegistrationRecovery();
    expect(Sentry.logger.info).toHaveBeenCalledWith('Doji push registration recovered', expect.objectContaining({
      failure_event_id: id, acknowledgement: 'server_confirmed', platform: os,
    }));
    expect(hasPendingPushRegistrationIncident()).toBe(false);
  } finally { Platform.OS = originalOS; }
});
