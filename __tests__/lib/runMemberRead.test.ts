import { runMemberRead } from '../../lib/runMemberRead';
import { shouldRetryQuery } from '../../lib/apiRetry';
import { apiFailureDetails } from '../../lib/apiFailureTelemetry';

jest.mock('@sentry/react-native', () => ({ init: jest.fn() }));

type Response = { data: unknown; error: unknown; status: number };
const ok: Response = { data: [{ id: 'local' }], error: null, status: 200 };
const wrappedAbort: Response = {
  data: null, error: { message: 'AbortError: Aborted', code: '', details: 'private' }, status: 0,
};
afterEach(() => jest.useRealTimers());

test('returns the original success envelope and cleans up the timer/listener', async () => {
  jest.useFakeTimers();
  const parent = new AbortController();
  const remove = jest.spyOn(parent.signal, 'removeEventListener');
  expect(await runMemberRead({ abortSignal: async () => ok }, parent.signal)).toBe(ok);
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  expect(jest.getTimerCount()).toBe(0);
});

test('a fulfilled SDK status-zero error at our deadline is retryable, not unexpected', async () => {
  jest.useFakeTimers();
  const abortSignal = jest.fn((signal: AbortSignal) => new Promise<Response>(resolve => {
    signal.addEventListener('abort', () => resolve(wrappedAbort));
  }));
  const pending = runMemberRead({ abortSignal }, undefined, 6000).catch(error => error);
  await jest.advanceTimersByTimeAsync(6000);
  const error = await pending;
  expect(apiFailureDetails(error).kind).toBe('timeout');
  expect(error).toMatchObject({ name: 'TimeoutError', status: 0, abortSource: 'deadline' });
  expect(error).not.toHaveProperty('details');
  expect(shouldRetryQuery(0, error)).toBe(true);
  expect(shouldRetryQuery(1, error)).toBe(false);
  expect(abortSignal).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('parent cancellation of a wrapped SDK error does not retry or report an unexpected error', async () => {
  const parent = new AbortController();
  const pending = runMemberRead({ abortSignal: signal => new Promise<Response>(resolve => {
    signal.addEventListener('abort', () => resolve(wrappedAbort));
  }) }, parent.signal).catch(error => error);
  parent.abort();
  const error = await pending;
  expect(apiFailureDetails(error).kind).toBe('cancelled');
  expect(shouldRetryQuery(0, error)).toBe(false);
});

test('already cancelled reads never dispatch', async () => {
  const parent = new AbortController();
  parent.abort();
  const abortSignal = jest.fn(async () => ok);
  await expect(runMemberRead({ abortSignal }, parent.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(abortSignal).not.toHaveBeenCalled();
});

test.each(['parent', 'deadline'])('rejects late successful responses after %s cancellation', async source => {
  jest.useFakeTimers();
  const parent = new AbortController();
  let finish!: (response: Response) => void;
  const pending = runMemberRead({ abortSignal: () => new Promise<Response>(resolve => {
    finish = resolve;
  }) }, parent.signal, 100).catch(error => error);
  if (source === 'parent') parent.abort();
  else await jest.advanceTimersByTimeAsync(100);
  finish(ok);
  expect(await pending).toMatchObject({ name: source === 'parent' ? 'AbortError' : 'TimeoutError' });
  expect(jest.getTimerCount()).toBe(0);
});

test.each([401, 403, 503, 504])('retains HTTP %s even if the parent also aborts', async status => {
  const parent = new AbortController();
  const error = await runMemberRead({ abortSignal: async () => {
    parent.abort();
    return { data: null, error: { message: 'failed' }, status };
  } }, parent.signal).catch(failure => failure);
  expect(error.status).toBe(status);
  expect(apiFailureDetails(error).kind).not.toBe('cancelled');
  expect(shouldRetryQuery(0, error)).toBe(status >= 500);
});

test('real SQLSTATE survives and permission errors do not retry', async () => {
  const error = await runMemberRead({ abortSignal: async () => ({ data: null,
    error: { code: '42501', message: 'permission denied', details: 'private', hint: 'private' }, status: 403,
  }) }).catch(failure => failure);
  expect(error).toMatchObject({ code: '42501', status: 403 });
  expect(error).not.toHaveProperty('details');
  expect(error).not.toHaveProperty('hint');
  expect(shouldRetryQuery(0, error)).toBe(false);
});

test('unproven abort remains visible, while a thrown network failure retains one retry', async () => {
  const unknown = await runMemberRead({ abortSignal: async () => wrappedAbort }).catch(error => error);
  expect(apiFailureDetails(unknown).kind).toBe('unexpected');
  const network = await runMemberRead({ abortSignal: async (): Promise<Response> => {
    throw new TypeError('Network request failed');
  } }).catch(error => error);
  expect(apiFailureDetails(network).kind).toBe('network');
  expect(shouldRetryQuery(0, network)).toBe(true);
  expect(shouldRetryQuery(1, network)).toBe(false);
});
