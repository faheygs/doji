const mockChannel = {
  state: 'initialized',
  subscribe: jest.fn().mockResolvedValue(undefined),
  unsubscribe: jest.fn(),
  detach: jest.fn().mockResolvedValue(undefined),
};
const mockChannelsGet = jest.fn(() => mockChannel);
const mockRelease = jest.fn();
const mockClose = jest.fn();
const mockReport = jest.fn();
let mockRealtimeOptions: Record<string, unknown> | undefined;
let mockAuthCallback:
  | ((params: unknown, callback: (error: string | null, token: unknown) => void) => void)
  | undefined;
const mockAuthorize = jest.fn(
  () =>
    new Promise((resolve, reject) => {
      mockAuthCallback?.({}, (error, token) => (error ? reject(new Error(error)) : resolve(token)));
    }),
);
function tokenResponse(postIds: string[]) {
  return {
    data: {
      keyName: 'key',
      ttl: 1,
      capability: JSON.stringify(
        Object.fromEntries(postIds.map((postId) => [`post:${postId}`, ['subscribe']])),
      ),
      clientId: 'user',
      timestamp: 1,
      nonce: 'nonce',
      mac: 'mac',
    },
    error: null,
  };
}
const mockInvoke = jest.fn((_name: string, options: { body: { postIds: string[] } }) =>
  Promise.resolve(tokenResponse(options.body.postIds)),
);

jest.mock('ably', () => ({
  Realtime: jest.fn().mockImplementation((options) => {
    mockRealtimeOptions = options;
    mockAuthCallback = options.authCallback;
    return {
      channels: { get: mockChannelsGet, release: mockRelease },
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
jest.mock('../../lib/telemetry', () => ({
  reportRealtimeFailure: (...args: unknown[]) => mockReport(...args),
  recordRealtimeFailure: jest.fn(),
}));

import { closeRealtimeConnection, subscribeToRealtimeChannel } from '../../lib/realtimeClient';

describe('realtime channel lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockChannel.state = 'initialized';
    mockChannel.subscribe.mockResolvedValue(undefined);
    mockChannel.detach.mockResolvedValue(undefined);
    mockChannelsGet.mockImplementation(() => mockChannel);
    mockAuthorize.mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          mockAuthCallback?.({}, (error, token) =>
            error ? reject(new Error(error)) : resolve(token),
          );
        }),
    );
    mockInvoke.mockImplementation((_name: string, options: { body: { postIds: string[] } }) =>
      Promise.resolve(tokenResponse(options.body.postIds)),
    );
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

  it('allows one cold token endpoint enough time to respond', async () => {
    const remove = await subscribeToRealtimeChannel('doji:global', jest.fn());
    expect(mockRealtimeOptions?.realtimeRequestTimeout).toBe(20_000);
    remove();
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

  it('reauthorizes for a post retained after an authorization snapshot', async () => {
    const firstId = '11111111-1111-4111-8111-111111111111';
    const secondId = '22222222-2222-4222-8222-222222222222';
    let finishFirst: ((value: ReturnType<typeof tokenResponse>) => void) | undefined;
    mockInvoke
      .mockImplementationOnce(
        (_name: string, options: { body: { postIds: string[] } }) =>
          new Promise((resolve) => {
            finishFirst = () => resolve(tokenResponse(options.body.postIds));
          }),
      )
      .mockImplementation((_name: string, options: { body: { postIds: string[] } }) =>
        Promise.resolve(tokenResponse(options.body.postIds)),
      );

    const firstSubscription = subscribeToRealtimeChannel(`post:${firstId}`, jest.fn());
    await Promise.resolve();
    await Promise.resolve();
    const secondSubscription = subscribeToRealtimeChannel(`post:${secondId}`, jest.fn());
    finishFirst?.(tokenResponse([firstId]));

    const [removeFirst, removeSecond] = await Promise.all([firstSubscription, secondSubscription]);

    expect(mockAuthorize).toHaveBeenCalledTimes(2);
    expect(mockInvoke).toHaveBeenLastCalledWith('realtime-token', {
      body: { postIds: [firstId, secondId] },
    });
    removeFirst();
    removeSecond();
  });

  it('rejects a post omitted from the authorized capability', async () => {
    const postId = '33333333-3333-4333-8333-333333333333';
    mockInvoke.mockResolvedValueOnce(tokenResponse([]));

    await expect(subscribeToRealtimeChannel(`post:${postId}`, jest.fn())).rejects.toThrow(
      `Realtime access is unavailable for post:${postId}`,
    );
  });

  it('reauthorizes and recreates a provider-failed post channel once', async () => {
    const postId = '44444444-4444-4444-8444-444444444444';
    const capabilityError = Object.assign(
      new Error('Channel operation failed as state is failed'),
      {
        cause: new Error(
          `Channel denied access based on given capability; channelId = post:${postId}`,
        ),
      },
    );
    const deniedChannel = {
      state: 'failed',
      subscribe: jest.fn().mockRejectedValue(capabilityError),
      unsubscribe: jest.fn(),
      detach: jest.fn().mockResolvedValue(undefined),
    };
    const recoveredChannel = {
      state: 'initialized',
      subscribe: jest.fn().mockResolvedValue(undefined),
      unsubscribe: jest.fn(),
      detach: jest.fn().mockResolvedValue(undefined),
    };
    mockChannelsGet.mockReturnValueOnce(deniedChannel).mockReturnValue(recoveredChannel);

    const remove = await subscribeToRealtimeChannel(`post:${postId}`, jest.fn());

    expect(mockAuthorize).toHaveBeenCalledTimes(2);
    expect(mockRelease).toHaveBeenCalledWith(`post:${postId}`);
    expect(recoveredChannel.subscribe).toHaveBeenCalledTimes(1);
    remove();
  });

  it('stops cleanly when refreshed authorization confirms post access was revoked', async () => {
    const postId = '55555555-5555-4555-8555-555555555555';
    const capabilityError = Object.assign(
      new Error('Channel operation failed as state is failed'),
      {
        errorReason: new Error(
          `Channel denied access based on given capability; channelId = post:${postId}`,
        ),
      },
    );
    mockChannel.state = 'failed';
    mockChannel.subscribe.mockRejectedValueOnce(capabilityError);
    mockInvoke
      .mockResolvedValueOnce(tokenResponse([postId]))
      .mockResolvedValueOnce(tokenResponse([]));

    await expect(subscribeToRealtimeChannel(`post:${postId}`, jest.fn())).rejects.toThrow(
      `Realtime access is unavailable for post:${postId}`,
    );
    expect(mockAuthorize).toHaveBeenCalledTimes(2);
    expect(mockReport).not.toHaveBeenCalled();
  });
});
