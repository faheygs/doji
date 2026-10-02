import { FetchQueryOptions, QueryCache, QueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { syncServerClock } from '../../lib/serverClock';
import { useAuthStore } from '../../stores/useAuthStore';
import { useAppAnnouncement } from '../../hooks/useAppAnnouncement';
import { useUpcomingDoji } from '../../hooks/useUpcomingDoji';
import { apiFailureDetails } from '../../lib/apiFailureTelemetry';
import { shouldRetryQuery } from '../../lib/apiRetry';

// Capture the real hooks' query functions, then execute them with real TanStack
// Query clients. This exercises the undefined-result contract, not a copy of it.
const mockCacheClient = { setQueryData: jest.fn() };
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: jest.fn(options => options),
  useMutation: jest.fn(() => ({ mutateAsync: jest.fn() })),
  useQueryClient: () => mockCacheClient,
}));
jest.mock('../../lib/supabase');
jest.mock('../../lib/serverClock', () => ({ syncServerClock: jest.fn() }));
jest.mock('../../stores/useAuthStore', () => ({ useAuthStore: jest.fn() }));
jest.mock('@sentry/react-native', () => ({ init: jest.fn() }));

const rpc = supabase.rpc as jest.Mock;
let client: QueryClient;
let onError: jest.Mock;
function optionsFor(hook: () => unknown) {
  hook();
  return (useQuery as jest.Mock).mock.calls.at(-1)[0] as FetchQueryOptions;
}
function queryFunction(options: FetchQueryOptions) {
  return options.queryFn as (context: { signal: AbortSignal }) => Promise<unknown>;
}
const upcoming = {
  server_now: '2026-09-27T12:00:00Z', daily_event_id: 'event-test',
  prelive_at: '2026-09-27T12:00:00Z', fires_at: '2026-09-27T12:20:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  (useAuthStore as unknown as jest.Mock).mockImplementation(selector => selector({ session: { user: { id: 'test-user' } } }));
  onError = jest.fn();
  client = new QueryClient({ queryCache: new QueryCache({ onError }), defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(() => { client.clear(); jest.useRealTimers(); });

test.each([[], null])('no eligible announcement (%j) is a successful null result, not an error or another claim', async data => {
  rpc.mockResolvedValue({ data, error: null, status: 200 });
  const options = optionsFor(() => useAppAnnouncement(true));
  expect(await client.fetchQuery(options)).toBeNull();
  expect(await client.fetchQuery(options)).toBeNull();
  expect(client.getQueryState(options.queryKey)?.status).toBe('success');
  expect(onError).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith('claim_active_app_announcement');
});

test('an eligible announcement and its existing atomic dismissal remain unchanged', async () => {
  const announcement = { id: 'notice', title: 'Update', body: 'Details', cta_label: null, cta_url: null };
  rpc.mockResolvedValueOnce({ data: [announcement], error: null, status: 200 });
  const options = optionsFor(() => useAppAnnouncement(true));
  expect(await client.fetchQuery(options)).toEqual(announcement);
  const action = (useMutation as jest.Mock).mock.calls.at(-1)[0];
  rpc.mockResolvedValueOnce({ error: null });
  await action.mutationFn({ id: 'notice', action: 'dismissed' });
  action.onSuccess();
  expect(rpc).toHaveBeenLastCalledWith('record_app_announcement_action', { p_announcement_id: 'notice', p_action: 'dismissed' });
  expect(mockCacheClient.setQueryData).toHaveBeenCalledWith(['appAnnouncement', 'test-user'], null);
  expect(rpc).toHaveBeenCalledTimes(2);
});

test('announcement failure remains an error with the actual HTTP status', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'unavailable', code: 'PGRST002' }, status: 503 });
  const options = optionsFor(() => useAppAnnouncement(true));
  await expect(client.fetchQuery({ ...options, retry: false })).rejects.toMatchObject({ status: 503, code: 'PGRST002' });
  expect(onError).toHaveBeenCalledTimes(1);
});

test('both queries remain disabled without a member session', () => {
  (useAuthStore as unknown as jest.Mock).mockImplementation(selector => selector({ session: null }));
  for (const hook of [() => useAppAnnouncement(true), useUpcomingDoji]) {
    hook();
    expect((useQuery as jest.Mock).mock.calls.at(-1)[0].enabled).toBe(false);
  }
  expect(rpc).not.toHaveBeenCalled();
});

test.each([null, upcoming])('upcoming state preserves the server clock contract for %j', async data => {
  jest.useFakeTimers();
  const abortSignal = jest.fn().mockResolvedValue({ data, error: null, status: 200 });
  rpc.mockReturnValue({ abortSignal });
  const result = await queryFunction(optionsFor(useUpcomingDoji))({ signal: new AbortController().signal });
  expect(result).toEqual(data);
  expect(rpc).toHaveBeenCalledWith('get_upcoming_doji_state');
  expect(rpc).toHaveBeenCalledTimes(1);
  if (data) expect(syncServerClock).toHaveBeenCalledWith(data.server_now);
  else expect(syncServerClock).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test.each(['deadline', 'parent'] as const)('wrapped SDK cancellation retains its %s origin', async source => {
  jest.useFakeTimers();
  rpc.mockReturnValue({ abortSignal: (signal: AbortSignal) => new Promise(resolve => {
    signal.addEventListener('abort', () => resolve({ data: null, error: { message: 'AbortError: Aborted', code: '' }, status: 0 }));
  }) });
  const parent = new AbortController();
  const pending = queryFunction(optionsFor(useUpcomingDoji))({ signal: parent.signal });
  const assertion = expect(pending).rejects.toMatchObject({ name: source === 'deadline' ? 'TimeoutError' : 'AbortError', abortSource: source, status: 0 });
  if (source === 'deadline') jest.advanceTimersByTime(6000);
  else parent.abort();
  await assertion;
  expect(syncServerClock).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test('a late successful response after cancellation cannot update the server clock', async () => {
  const parent = new AbortController();
  rpc.mockReturnValue({ abortSignal: async () => { parent.abort(); return { data: upcoming, error: null, status: 200 }; } });
  await expect(queryFunction(optionsFor(useUpcomingDoji))({ signal: parent.signal })).rejects.toMatchObject({ name: 'AbortError' });
  expect(syncServerClock).not.toHaveBeenCalled();
});

test('upcoming errors preserve envelope status and thrown network failures', async () => {
  rpc.mockReturnValueOnce({ abortSignal: async () => ({ data: null, error: { code: 'XX000', message: 'failure' }, status: 503 }) });
  await expect(client.fetchQuery(optionsFor(useUpcomingDoji))).rejects.toMatchObject({ status: 503, code: 'XX000', abortSource: 'none' });
  rpc.mockReturnValueOnce({ abortSignal: async () => { throw new TypeError('Network request failed'); } });
  const error = await queryFunction(optionsFor(useUpcomingDoji))({ signal: new AbortController().signal }).catch(error => error);
  expect(apiFailureDetails(error).kind).toBe('network');
  expect(syncServerClock).not.toHaveBeenCalled();
});

test('real query cancellation stops the in-flight RPC without a cache incident or retry', async () => {
  rpc.mockReturnValue({ abortSignal: (signal: AbortSignal) => new Promise(resolve => {
    signal.addEventListener('abort', () => resolve({ data: null, error: { message: 'AbortError: Aborted' }, status: 0 }));
  }) });
  const options = optionsFor(useUpcomingDoji);
  const pending = client.fetchQuery({ ...options, retry: shouldRetryQuery });
  const settled = pending.catch(() => null);
  await client.cancelQueries({ queryKey: options.queryKey });
  await settled;
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(onError).not.toHaveBeenCalled();
  expect(syncServerClock).not.toHaveBeenCalled();
});

test.each([true, false])('deadline retry is bounded and reports only terminal failure (recovery=%s)', async recover => {
  jest.useFakeTimers();
  let attempts = 0;
  rpc.mockImplementation(() => ({ abortSignal: (signal: AbortSignal) => {
    attempts += 1;
    if (recover && attempts === 2) return Promise.resolve({ data: upcoming, error: null, status: 200 });
    return new Promise(resolve => {
      signal.addEventListener('abort', () => resolve({ data: null, error: { message: 'AbortError: Aborted', code: '' }, status: 0 }));
    });
  } }));
  const pending = client.fetchQuery({ ...optionsFor(useUpcomingDoji), retry: shouldRetryQuery, retryDelay: 1 });
  const assertion = recover ? expect(pending).resolves.toEqual(upcoming) : expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
  await jest.advanceTimersByTimeAsync(12_010);
  await assertion;
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(onError).toHaveBeenCalledTimes(recover ? 0 : 1);
  expect(syncServerClock).toHaveBeenCalledTimes(recover ? 1 : 0);
});
