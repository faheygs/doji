import { QueryClient } from '@tanstack/react-query';
import { fetchPollSummary, fetchPollVotersPage } from '../../lib/pollQueries';
import { shouldRetryQuery } from '../../lib/apiRetry';

const mockRead = jest.fn();
const mockRpc = jest.fn(() => ({ abortSignal: mockRead }));
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }));
const cases = [
  ['summary', (signal: AbortSignal) => fetchPollSummary('event', 'friends', signal)],
  ['voters', (signal: AbortSignal) => fetchPollVotersPage('event', 'option', 'friends', null, signal)],
] as const;
let client: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: shouldRetryQuery, retryDelay: 1, gcTime: 0 } } });
});
afterEach(() => { client.clear(); jest.useRealTimers(); });

test.each(cases)('%s retries transient failure once but not permission denial', async (name, read) => {
  mockRead.mockResolvedValue({ data: null, error: { message: 'unavailable' }, status: 503 });
  await expect(client.fetchQuery({ queryKey: [name], queryFn: ({ signal }) => read(signal) })).rejects.toMatchObject({ status: 503 });
  expect(mockRead).toHaveBeenCalledTimes(2);
  mockRead.mockClear();
  mockRead.mockResolvedValue({ data: null, error: { code: '42501', message: 'denied' }, status: 403 });
  await expect(client.fetchQuery({ queryKey: [name], queryFn: ({ signal }) => read(signal) })).rejects.toMatchObject({ status: 403 });
  expect(mockRead).toHaveBeenCalledTimes(1);
});

test.each(cases)('%s bounds a stalled read and ignores late results', async (_name, read) => {
  jest.useFakeTimers();
  let finish!: (response: unknown) => void;
  mockRead.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const pending = read(new AbortController().signal).catch(error => error);
  await jest.advanceTimersByTimeAsync(8000);
  const error = await pending;
  expect(error).toMatchObject({ name: 'TimeoutError', abortSource: 'deadline' });
  finish({ data: [{ id: 'old' }], error: null, status: 200 });
  await jest.advanceTimersByTimeAsync(0);
  expect(await pending).toBe(error);
  expect(jest.getTimerCount()).toBe(0);
});

test.each(cases)('%s propagates parent cancellation', async (_name, read) => {
  const parent = new AbortController();
  mockRead.mockImplementation(() => new Promise(() => {}));
  const pending = read(parent.signal).catch(error => error);
  parent.abort();
  expect(await pending).toMatchObject({ name: 'AbortError', abortSource: 'parent' });
});

test('preserves summary audience and bounded voter cursor contract', async () => {
  mockRead.mockResolvedValue({ data: [], error: null, status: 200 });
  await fetchPollSummary('event', 'everyone');
  expect(mockRpc).toHaveBeenCalledWith('get_poll_results_summary', { p_daily_event_id: 'event', p_audience: 'everyone' });
  await fetchPollVotersPage('event', 'option', 'friends', { createdAt: 'time', id: 'vote' });
  expect(mockRpc).toHaveBeenLastCalledWith('get_poll_option_voters_page', {
    p_daily_event_id: 'event', p_option_id: 'option', p_audience: 'friends', p_limit: 40,
    p_before_created_at: 'time', p_before_id: 'vote',
  });
});
