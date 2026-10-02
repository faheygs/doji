import { fetchFeedPostsPage } from '../../lib/feedQueries';
import { readThroughScaleGateway } from '../../lib/scaleReadGateway';
import { supabase } from '../../lib/supabase';
import { shouldRetryQuery } from '../../lib/apiRetry';

// The same polyfill installed by React Native's setUpXHR (no signal.reason).
const NativeAbortController = require('abort-controller').AbortController;

describe('member request lifetime on the installed native abort runtime', () => {
  const originalController = global.AbortController;
  const originalFetch = global.fetch;
  const originalUrl = process.env.EXPO_PUBLIC_SCALE_READ_URL;
  const session = jest.spyOn(supabase.auth, 'getSession');
  const rpc = jest.spyOn(supabase, 'rpc');
  let transportSignal: AbortSignal;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    global.AbortController = NativeAbortController;
    process.env.EXPO_PUBLIC_SCALE_READ_URL = 'https://scale.test';
    session.mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null });
    global.fetch = jest.fn().mockImplementation((_url, options) => {
      transportSignal = options.signal;
      return new Promise((_resolve, reject) => {
        transportSignal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
      });
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    global.AbortController = originalController;
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_SCALE_READ_URL;
    else process.env.EXPO_PUBLIC_SCALE_READ_URL = originalUrl;
  });

  it('produces a real retryable deadline error without signal.reason', async () => {
    const fallback = jest.fn();
    const result = readThroughScaleGateway('/v1/feed', fallback).catch(error => error);
    await jest.advanceTimersByTimeAsync(8_000);
    expect(transportSignal.reason).toBeUndefined();
    const error = await result;
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: 'TimeoutError', abortSource: 'deadline' });
    expect(shouldRetryQuery(0, error)).toBe(true);
    expect(shouldRetryQuery(1, error)).toBe(false);
    expect(fallback).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not send a pre-cancelled gateway read', async () => {
    const parent = new AbortController(); parent.abort();
    await expect(readThroughScaleGateway('/v1/feed', jest.fn(), parent.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('keeps a deadline classification if the parent cancels before rejection settles', async () => {
    const parent = new AbortController();
    const result = readThroughScaleGateway('/v1/feed', jest.fn(), parent.signal).catch(error => error);
    await jest.advanceTimersByTimeAsync(0);
    jest.advanceTimersByTime(8_000); parent.abort();
    expect(await result).toMatchObject({ name: 'TimeoutError', abortSource: 'deadline' });
  });

  it('does not retry lifecycle cancellation on the native runtime', async () => {
    const parent = new AbortController();
    const result = readThroughScaleGateway('/v1/feed', jest.fn(), parent.signal).catch(error => error);
    await jest.advanceTimersByTimeAsync(0); parent.abort();
    const error = await result;
    expect(error).toMatchObject({ name: 'AbortError', abortSource: 'parent' });
    expect(shouldRetryQuery(0, error)).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  describe.each([false, true])('feed unlocked=%s', unlocked => {
    const context = { userId: 'member', dailyEventId: 'event', audience: 'everyone' as const, unlocked };
    it('keeps the parent connected until gateway transport finishes', async () => {
      const parent = new AbortController();
      const result = fetchFeedPostsPage(context, { offset: 0 }, parent.signal).catch(error => error);
      await jest.advanceTimersByTimeAsync(0);
      expect(jest.getTimerCount()).toBe(1);
      parent.abort();
      expect(transportSignal.aborted).toBe(true);
      expect(await result).toMatchObject({ name: 'AbortError' });
      expect(jest.getTimerCount()).toBe(0);
    });

    it('retains its direct-read deadline and normalizes SDK-wrapped aborts', async () => {
      delete process.env.EXPO_PUBLIC_SCALE_READ_URL;
      rpc.mockReturnValue({ abortSignal: (signal: AbortSignal) => new Promise(resolve => {
        transportSignal = signal;
        signal.addEventListener('abort', () => resolve({ data: null, status: 0, error: { message: 'AbortError: Aborted', code: '' } }));
      }) } as never);
      const result = fetchFeedPostsPage(context, { offset: 0 }).catch(error => error);
      expect(jest.getTimerCount()).toBe(1);
      await jest.advanceTimersByTimeAsync(8_000);
      const error = await result;
      expect(error).toMatchObject({ name: 'TimeoutError', status: 0, abortSource: 'deadline' });
      expect(shouldRetryQuery(0, error)).toBe(true);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('rejects late success after cancellation rather than returning stale records', async () => {
      delete process.env.EXPO_PUBLIC_SCALE_READ_URL;
      let complete!: (value: unknown) => void;
      rpc.mockReturnValue({ abortSignal: () => new Promise(resolve => { complete = resolve; }) } as never);
      const parent = new AbortController();
      const result = fetchFeedPostsPage(context, { offset: 0 }, parent.signal).catch(error => error);
      parent.abort(); complete({ data: [{ id: 'stale' }], error: null, status: 200 });
      expect(await result).toMatchObject({ name: 'AbortError' });
      expect(jest.getTimerCount()).toBe(0);
    });

    it('cleans up after success and preserves real permission errors', async () => {
      delete process.env.EXPO_PUBLIC_SCALE_READ_URL;
      const parent = new AbortController();
      rpc.mockReturnValue({ abortSignal: () => Promise.resolve({ data: [], error: null, status: 200 }) } as never);
      await expect(fetchFeedPostsPage(context, { offset: 0 }, parent.signal)).resolves.toEqual([]);
      expect(jest.getTimerCount()).toBe(0);
      rpc.mockReturnValue({ abortSignal: () => {
        parent.abort();
        return Promise.resolve({ data: null, status: 403, error: { message: 'Permission denied', code: '42501' } });
      } } as never);
      const error = await fetchFeedPostsPage(context, { offset: 0 }, parent.signal).catch(error => error);
      expect(error).toMatchObject({ name: 'Error', status: 403, code: '42501' });
      expect(shouldRetryQuery(0, error)).toBe(false);
      expect(jest.getTimerCount()).toBe(0);
    });
  });
});
