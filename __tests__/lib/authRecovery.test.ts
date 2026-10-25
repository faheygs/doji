const mockGetSession = jest.fn();
const mockRefreshSession = jest.fn();
const mockInvoke = jest.fn();
jest.mock('../../lib/telemetry', () => ({ recordRealtimeFailure: jest.fn() }));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      refreshSession: (...args: unknown[]) => mockRefreshSession(...args),
    },
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

import { executeCommand } from '../../lib/commandGateway';
import {
  requestRealtimeToken,
  resetRealtimeAuthorization,
  resumeRealtimeAuthorization,
  ensurePostCapability,
} from '../../lib/realtimeAuthorization';
import { recordRealtimeFailure } from '../../lib/telemetry';

function session(accessToken: string) {
  return { data: { session: { access_token: accessToken } }, error: null };
}

describe('authentication recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRealtimeAuthorization();
    process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL = 'https://commands.example.test';
  });

  afterEach(() => {
    resetRealtimeAuthorization();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('foreground renews disconnected SDK authorization but leaves healthy connections alone', async () => {
    const error = new Error('network');
    const authorize = jest.fn().mockRejectedValue(error);
    const realtime = { connection: { state: 'connected' }, auth: { authorize } };
    resumeRealtimeAuthorization(realtime as never, () => true);
    expect(authorize).not.toHaveBeenCalled();
    realtime.connection.state = 'connecting';
    resumeRealtimeAuthorization(realtime as never, () => true);
    await Promise.resolve();
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(recordRealtimeFailure).toHaveBeenCalledWith('foreground_authorization', error);
    jest.mocked(recordRealtimeFailure).mockClear();
    resumeRealtimeAuthorization(realtime as never, () => false);
    await Promise.resolve();
    expect(recordRealtimeFailure).not.toHaveBeenCalled();
  });

  it('bounds the complete provider authorization and cancels capability waiters on reset', async () => {
    jest.useFakeTimers();
    const realtime = { auth: { authorize: jest.fn(() => new Promise(() => {})) } };
    const first = ensurePostCapability(realtime as never, 'post:one', () => true).catch((e) => e);
    await jest.advanceTimersByTimeAsync(35_080);
    expect((await first).message).toContain('timed out');
    const second = ensurePostCapability(realtime as never, 'post:two', () => true).catch((e) => e);
    await jest.advanceTimersByTimeAsync(500);
    resetRealtimeAuthorization();
    await jest.advanceTimersByTimeAsync(0);
    expect((await second).message).toContain('superseded');
  });

  it.each([false, true])('aborts a timed-out token read and recovers (native controller=%s)', async (native) => {
    if (native) {
      const NativeController = jest.requireActual('abort-controller').AbortController;
      jest.spyOn(globalThis, 'AbortController').mockImplementation(() => new NativeController());
    }
    jest.useFakeTimers();
    mockGetSession.mockResolvedValue(session('token'));
    mockInvoke.mockImplementationOnce(() => new Promise(() => {}));
    const first = jest.fn();
    requestRealtimeToken({} as never, new Set(), () => true, first);
    await jest.advanceTimersByTimeAsync(15_000);
    expect(first).toHaveBeenCalledWith(expect.stringContaining('timed out'), null);
    expect(mockInvoke.mock.calls[0][1].signal.aborted).toBe(true);
    mockInvoke.mockResolvedValueOnce({ data: { capability: '{}' }, error: null });
    const next = jest.fn();
    requestRealtimeToken({} as never, new Set(), () => true, next);
    await jest.advanceTimersByTimeAsync(0);
    expect(next).toHaveBeenCalledWith(null, { capability: '{}' });
  });

  it('reset fences active and queued token work without waiting for the old deadline', async () => {
    jest.useFakeTimers();
    mockGetSession.mockResolvedValue(session('token'));
    let finish!: (value: unknown) => void;
    mockInvoke.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const active = jest.fn();
    const queued = jest.fn();
    requestRealtimeToken({} as never, new Set(), () => true, active);
    requestRealtimeToken({} as never, new Set(), () => true, queued);
    await jest.advanceTimersByTimeAsync(0);
    resetRealtimeAuthorization();
    await jest.advanceTimersByTimeAsync(0);
    expect(mockInvoke.mock.calls[0][1].signal.aborted).toBe(true);
    expect(active).toHaveBeenCalledWith(expect.any(String), null);
    expect(queued).toHaveBeenCalledWith(expect.any(String), null);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    finish({ data: { capability: '{}' }, error: null });
    await jest.advanceTimersByTimeAsync(0);
    expect(active).toHaveBeenCalledTimes(1);
  });

  it('does not refresh a rejected token after its client has been superseded', async () => {
    mockGetSession.mockResolvedValue(session('token'));
    let current = true;
    mockInvoke.mockImplementationOnce(async () => {
      current = false;
      return { data: null, error: { status: 401 } };
    });
    const result = await new Promise((resolve) => {
      requestRealtimeToken({} as never, new Set(), () => current,
        (error, token) => resolve({ error, token }));
    });
    expect(result).toEqual({ error: expect.any(String), token: null });
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });

  it('refreshes a rejected session and explicitly retries realtime authorization', async () => {
    mockGetSession.mockResolvedValueOnce(session('stale-token'));
    mockRefreshSession.mockResolvedValueOnce(session('fresh-token'));
    mockInvoke
      .mockResolvedValueOnce({
        data: null,
        error: { context: { status: 401 }, message: 'Unauthorized' },
      })
      .mockResolvedValueOnce({
        data: { capability: '{}', keyName: 'key', mac: 'mac', nonce: 'nonce', timestamp: 1 },
        error: null,
      });

    const result = await new Promise<{ error: string | null; token: unknown }>((resolve) => {
      requestRealtimeToken(
        {} as never,
        new Set(['post:11111111-1111-4111-8111-111111111111']),
        () => true,
        (error, token) => resolve({ error, token }),
      );
    });

    expect(result.error).toBeNull();
    expect(result.token).toBeTruthy();
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenNthCalledWith(
      1,
      'realtime-token',
      expect.objectContaining({ headers: { Authorization: 'Bearer stale-token' } }),
    );
    expect(mockInvoke).toHaveBeenNthCalledWith(
      2,
      'realtime-token',
      expect.objectContaining({ headers: { Authorization: 'Bearer fresh-token' } }),
    );
  });

  it('refreshes a 401 command response and retries the same idempotent command', async () => {
    mockGetSession.mockResolvedValueOnce(session('stale-token'));
    mockRefreshSession.mockResolvedValueOnce(session('fresh-token'));
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ message: 'Unauthorized' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ active: true }),
      } as Response);

    const args = {
      p_post_id: '11111111-1111-4111-8111-111111111111',
      p_emoji: 'like',
      p_active: true,
      p_idempotency_key: 'reaction:test:0000000000000001',
    };
    const result = await executeCommand('set_post_reaction', args);

    expect(result.error).toBeNull();
    expect(result.data).toEqual({ active: true });
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).authorization)
      .toBe('Bearer stale-token');
    expect((fetchMock.mock.calls[1][1]?.headers as Record<string, string>).authorization)
      .toBe('Bearer fresh-token');
    expect(fetchMock.mock.calls[0][1]?.body).toBe(fetchMock.mock.calls[1][1]?.body);
  });
});
