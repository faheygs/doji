const mockGetSession = jest.fn();
const mockRefreshSession = jest.fn();
const mockInvoke = jest.fn();

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
} from '../../lib/realtimeAuthorization';

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
    jest.restoreAllMocks();
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
