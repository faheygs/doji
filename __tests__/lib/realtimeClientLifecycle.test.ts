const mockChannel = {
  subscribe: jest.fn().mockResolvedValue(undefined),
  unsubscribe: jest.fn(),
  detach: jest.fn().mockResolvedValue(undefined),
};
const mockRelease = jest.fn();
const mockClose = jest.fn();
let mockAuthCallback:
  | ((params: unknown, callback: (error: string | null, token: unknown) => void) => void)
  | undefined;
const mockAuthorize = jest.fn(
  () =>
    new Promise((resolve, reject) => {
      mockAuthCallback?.({}, (error, token) => (error ? reject(new Error(error)) : resolve(token)));
    }),
);
const mockInvoke = jest.fn().mockResolvedValue({
  data: {
    keyName: 'key',
    ttl: 1,
    capability: '{}',
    clientId: 'user',
    timestamp: 1,
    nonce: 'nonce',
    mac: 'mac',
  },
  error: null,
});

jest.mock('ably', () => ({
  Realtime: jest.fn().mockImplementation((options) => {
    mockAuthCallback = options.authCallback;
    return {
      channels: { get: jest.fn(() => mockChannel), release: mockRelease },
      auth: { authorize: mockAuthorize },
      connection: { on: jest.fn(), off: jest.fn() },
      connect: jest.fn(),
      close: mockClose,
    };
  }),
}));
jest.mock('../../lib/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } },
}));
jest.mock('../../lib/telemetry', () => ({ reportRealtimeFailure: jest.fn() }));

import { closeRealtimeConnection, subscribeToRealtimeChannel } from '../../lib/realtimeClient';

describe('realtime channel lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    closeRealtimeConnection();
    jest.useRealTimers();
  });

  it('detaches and releases only after the final subscriber leaves', async () => {
    const removeFirst = await subscribeToRealtimeChannel('doji:global', jest.fn(), {
      rewind: '10s',
    });
    const removeSecond = await subscribeToRealtimeChannel('doji:global', jest.fn(), {
      rewind: '10s',
    });

    removeFirst();
    jest.advanceTimersByTime(300);
    await Promise.resolve();
    expect(mockChannel.detach).not.toHaveBeenCalled();

    removeSecond();
    jest.advanceTimersByTime(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(mockChannel.detach).toHaveBeenCalledTimes(1);
    expect(mockRelease).toHaveBeenCalledWith('doji:global');

    removeSecond();
    expect(mockChannel.detach).toHaveBeenCalledTimes(1);
  });

  it('requests an exact capability before attaching a post channel', async () => {
    const postId = 'c71e8d02-9733-4042-aa14-1ecfbc870512';
    const remove = await subscribeToRealtimeChannel(`post:${postId}`, jest.fn());

    expect(mockAuthorize).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith('realtime-token', {
      body: { postIds: [postId] },
    });
    remove();
  });
});
