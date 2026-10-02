import { readThroughScaleGateway } from '../../lib/scaleReadGateway';
import { supabase } from '../../lib/supabase';
import { isTransientApiError, shouldRetryQuery } from '../../lib/apiRetry';

describe('scale-read client', () => {
  const originalFetch = global.fetch;
  const mockGetSession = jest.spyOn(supabase.auth, 'getSession');
  const mockRefreshSession = jest.spyOn(supabase.auth, 'refreshSession');

  beforeEach(() => {
    process.env.EXPO_PUBLIC_SCALE_READ_URL = 'https://scale.test';
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'old-token' } },
      error: null,
    });
    mockRefreshSession.mockResolvedValue({
      data: { session: { access_token: 'new-token' } },
      error: null,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    delete process.env.EXPO_PUBLIC_SCALE_READ_URL;
    global.fetch = originalFetch;
  });

  it('refreshes an expired session once and keeps the read on the gateway', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(new Response('{"error":"expired"}', { status: 401 }))
      .mockResolvedValueOnce(Response.json({ id: 'profile' }));
    global.fetch = fetchMock;
    const directRead = jest.fn();

    await expect(
      readThroughScaleGateway('/v1/profiles/tester', directRead),
    ).resolves.toEqual({ id: 'profile' });
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://scale.test/v1/profiles/tester',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer new-token' }),
      }),
    );
    expect(directRead).not.toHaveBeenCalled();
  });

  it('uses the direct read only when scale mode is not configured', async () => {
    delete process.env.EXPO_PUBLIC_SCALE_READ_URL;
    const directRead = jest.fn().mockResolvedValue({ id: 'direct' });

    await expect(readThroughScaleGateway('/v1/profiles/tester', directRead)).resolves.toEqual({
      id: 'direct',
    });
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it('bounds auth waiting without sending a late request or signing the member out', async () => {
    jest.useFakeTimers();
    let release!: (value: unknown) => void;
    mockGetSession.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }) as never);
    global.fetch = jest.fn();
    const pending = readThroughScaleGateway('/v1/feed', jest.fn()).catch(error => error);
    await jest.advanceTimersByTimeAsync(8_000);
    expect(await pending).toMatchObject({ name: 'TimeoutError', abortSource: 'deadline' });
    release({ data: { session: { access_token: 'late-token' } }, error: null });
    await jest.advanceTimersByTimeAsync(0);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockRefreshSession).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([401, 403, 429, 503])('preserves HTTP %i classification without bypassing the gateway', async status => {
    global.fetch = jest.fn().mockResolvedValue(new Response('{}', { status }));
    const directRead = jest.fn();
    const error = await readThroughScaleGateway('/v1/feed', directRead).catch(error => error);
    expect(error.status).toBe(status);
    expect(isTransientApiError(error)).toBe(status === 429 || status === 503);
    expect(shouldRetryQuery(1, error)).toBe(false);
    expect(directRead).not.toHaveBeenCalled();
  });

  it('keeps cancellation connected during response body consumption', async () => {
    const parent = new AbortController();
    let startBody!: () => void;
    const bodyStarted = new Promise<void>(resolve => { startBody = resolve; });
    global.fetch = jest.fn().mockImplementation((_url, options) => Promise.resolve({ ok: true,
      json: () => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason)); startBody();
      }),
    }));
    const result = readThroughScaleGateway('/v1/feed', jest.fn(), parent.signal).catch(error => error);
    await bodyStarted;
    const cancelled = new Error('caller cancelled'); parent.abort(cancelled);
    expect(await result).toMatchObject({ name: 'AbortError', message: 'Request cancelled' });
  });

  it('bounds a stalled response body by the eight-second read deadline', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn().mockImplementation((_url, options) => Promise.resolve({ ok: true,
      json: () => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('Aborted')));
      }),
    }));
    const result = readThroughScaleGateway('/v1/feed', jest.fn()).catch(error => error);
    await jest.advanceTimersByTimeAsync(8_000);
    expect((await result).message).toBe('Request timed out after 8000ms');
    expect(jest.getTimerCount()).toBe(0);
  });
});
