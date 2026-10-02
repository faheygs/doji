import {
  closeRealtimeConnection,
  onRealtimeConnectionChange,
  subscribeToRealtimeChannel,
} from '../../lib/realtimeClient';
import { recordRealtimeFailure, reportRealtimeFailure } from '../../lib/telemetry';
import {
  ensurePostCapability,
  invalidatePostCapability,
  requestRealtimeToken,
  resetRealtimeAuthorization,
} from '../../lib/realtimeAuthorization';
import { RealtimeLifecycleSupersededError } from '../../lib/realtimeChannelErrors';

type Change = { current: string; reason?: unknown };
type NativeMessage = { id?: string; name?: string; data?: unknown };
const mockChannel = {
  state: 'initialized',
  errorReason: undefined as unknown,
  subscribe: jest.fn(),
  unsubscribe: jest.fn(),
  detach: jest.fn(),
};
const mockInstances: {
  channels: { get: jest.Mock; release: jest.Mock };
  connection: { on: jest.Mock; off: jest.Mock };
  connect: jest.Mock;
  close: jest.Mock;
  options: { authCallback: (params: unknown, callback: unknown) => void };
}[] = [];
jest.mock('ably', () => ({
  Realtime: jest.fn().mockImplementation((options) => {
    const instance = {
      channels: { get: jest.fn(() => mockChannel), release: jest.fn() },
      connection: { on: jest.fn(), off: jest.fn() },
      connect: jest.fn(),
      close: jest.fn(),
      options,
    };
    mockInstances.push(instance);
    return instance;
  }),
}));
// Authorization has its own real-provider-boundary tests. Here isolate the
// client's connection/subscription lifecycle, not the code under test itself.
jest.mock('../../lib/realtimeAuthorization', () => ({
  ensurePostCapability: jest.fn(),
  requestRealtimeToken: jest.fn(),
  resetRealtimeAuthorization: jest.fn(),
  invalidatePostCapability: jest.fn(),
  isRealtimeAccessUnavailable: (error: unknown) =>
    error instanceof Error && error.name === 'SyntheticAccessUnavailable',
}));
jest.mock('../../lib/telemetry', () => ({
  recordRealtimeFailure: jest.fn(),
  reportRealtimeFailure: jest.fn(),
}));
const current = () => mockInstances[mockInstances.length - 1];
function emit(change: Change, instance = current()) {
  const callback = instance.connection.on.mock.calls[0][0] as (value: Change) => void;
  callback(change);
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(Math, 'random').mockReturnValue(0);
  jest.clearAllMocks();
  mockInstances.length = 0;
  mockChannel.state = 'initialized';
  mockChannel.errorReason = undefined;
  mockChannel.subscribe.mockReset().mockResolvedValue(undefined);
  mockChannel.detach.mockReset().mockResolvedValue(undefined);
  jest.mocked(ensurePostCapability).mockReset().mockResolvedValue();
});
afterEach(() => {
  closeRealtimeConnection();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('connection listener ownership is removed without closing the shared client', () => {
  const handler = jest.fn();
  const off = onRealtimeConnectionChange(handler);
  expect(current().connect).toHaveBeenCalledTimes(1);
  expect(current().connection.on).toHaveBeenCalledWith(handler);
  off();
  expect(current().connection.off).toHaveBeenCalledWith(handler);
  expect(current().close).not.toHaveBeenCalled();
});
test('suspension is diagnostic; only failed state schedules bounded exponential recovery', async () => {
  onRealtimeConnectionChange(jest.fn());
  emit({ current: 'connecting' });
  emit({ current: 'suspended', reason: 'radio' });
  await jest.advanceTimersByTimeAsync(30000);
  expect(current().connect).toHaveBeenCalledTimes(1);
  for (const [index, delay] of [1000, 2000, 4000, 8000, 16000, 16000].entries()) {
    emit({ current: 'failed', reason: 'provider' });
    await jest.advanceTimersByTimeAsync(delay - 1);
    expect(current().connect).toHaveBeenCalledTimes(index + 1);
    await jest.advanceTimersByTimeAsync(1);
    expect(current().connect).toHaveBeenCalledTimes(index + 2);
  }
  expect(resetRealtimeAuthorization).toHaveBeenCalledTimes(6);
  expect(reportRealtimeFailure).toHaveBeenCalledWith('connection_recovery_exhausted', 'provider', {
    state: 'failed',
    attempt: 3,
  });
});
test('duplicate failure events share one timer and a connection cancels it and resets backoff', async () => {
  onRealtimeConnectionChange(jest.fn());
  emit({ current: 'failed' });
  emit({ current: 'failed' });
  expect(jest.getTimerCount()).toBe(1);
  emit({ current: 'connected' });
  expect(jest.getTimerCount()).toBe(0);
  emit({ current: 'failed' });
  await jest.advanceTimersByTimeAsync(1000);
  expect(current().connect).toHaveBeenCalledTimes(2);
  expect(reportRealtimeFailure).not.toHaveBeenCalled();
});
test('closing cancels scheduled recovery and stale failed events cannot reconnect an old client', async () => {
  onRealtimeConnectionChange(jest.fn());
  const old = current();
  emit({ current: 'failed' });
  closeRealtimeConnection();
  onRealtimeConnectionChange(jest.fn());
  emit({ current: 'failed' }, old);
  await jest.runAllTimersAsync();
  expect(old.close).toHaveBeenCalledTimes(1);
  expect(old.connect).toHaveBeenCalledTimes(1);
  expect(current().connect).toHaveBeenCalledTimes(1);
});
test('messages preserve explicit event IDs and use provider defaults only when absent', async () => {
  const receive = jest.fn();
  await subscribeToRealtimeChannel('doji:global', receive, { rewind: '10s' });
  const listener = mockChannel.subscribe.mock.calls[0][0] as (message: NativeMessage) => void;
  listener({
    id: 'provider',
    name: 'post.updated',
    data: { eventId: 'domain', aggregateId: 'post', safe: true },
  });
  listener({ id: 'fallback' });
  listener({ data: { eventId: 2, aggregateId: 3 } });
  expect(receive.mock.calls.map(([event]) => event)).toEqual([
    {
      eventId: 'domain',
      type: 'post.updated',
      aggregateId: 'post',
      payload: { eventId: 'domain', aggregateId: 'post', safe: true },
    },
    { eventId: 'fallback', type: 'state.updated', aggregateId: undefined, payload: {} },
    {
      eventId: undefined,
      type: 'state.updated',
      aggregateId: undefined,
      payload: { eventId: 2, aggregateId: 3 },
    },
  ]);
  expect(current().channels.get).toHaveBeenCalledWith('doji:global', { params: { rewind: '10s' } });
});
test('same-transition remount cancels release; failing detach still releases the last channel', async () => {
  const first = await subscribeToRealtimeChannel('doji:global', jest.fn());
  first();
  const second = await subscribeToRealtimeChannel('doji:global', jest.fn());
  await jest.runAllTimersAsync();
  expect(mockChannel.detach).not.toHaveBeenCalled();
  mockChannel.detach.mockRejectedValueOnce(Error('already detached'));
  second();
  second();
  await jest.runAllTimersAsync();
  expect(mockChannel.detach).toHaveBeenCalledTimes(1);
  expect(current().channels.release).toHaveBeenCalledTimes(1);
});
test('late detach completion cannot release a newly retained channel', async () => {
  let finish!: () => void;
  mockChannel.detach.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const remove = await subscribeToRealtimeChannel('doji:global', jest.fn());
  remove();
  await jest.advanceTimersByTimeAsync(0);
  await subscribeToRealtimeChannel('doji:global', jest.fn());
  finish();
  await jest.runAllTimersAsync();
  expect(current().channels.release).not.toHaveBeenCalled();
});
test.each([
  ['unexpected', Error('invalid provider response'), true],
  ['transport', Error('network unreachable'), false],
] as const)(
  '%s failures retry four times and preserve incident classification',
  async (_name, error, reports) => {
    mockChannel.state = 'failed';
    mockChannel.subscribe.mockRejectedValue(error);
    const pending = subscribeToRealtimeChannel('doji:global', jest.fn());
    const rejected = expect(pending).rejects.toBe(error);
    await jest.runAllTimersAsync();
    await rejected;
    expect(mockChannel.subscribe).toHaveBeenCalledTimes(4);
    expect(mockChannel.unsubscribe).toHaveBeenCalledTimes(4);
    expect(current().channels.release).toHaveBeenCalledTimes(3);
    expect(reportRealtimeFailure).toHaveBeenCalledTimes(reports ? 1 : 0);
  },
);
test('client close while a subscription is failing returns a lifecycle error without incident reporting', async () => {
  mockChannel.subscribe.mockImplementationOnce(() => {
    closeRealtimeConnection();
    return Promise.reject(Error('connection closed'));
  });
  await expect(subscribeToRealtimeChannel('doji:global', jest.fn())).rejects.toBeInstanceOf(
    RealtimeLifecycleSupersededError,
  );
  expect(mockChannel.subscribe).toHaveBeenCalledTimes(1);
  expect(reportRealtimeFailure).not.toHaveBeenCalled();
  expect(recordRealtimeFailure).toHaveBeenCalledWith(
    'channel_subscribe_superseded',
    expect.any(Error),
    { channelScope: 'app' },
  );
});
test('revoked post access stops before subscription and removes it from future token requests', async () => {
  const error = Object.assign(Error('revoked'), { name: 'SyntheticAccessUnavailable' });
  jest.mocked(ensurePostCapability).mockRejectedValueOnce(error);
  await expect(subscribeToRealtimeChannel('post:denied', jest.fn())).rejects.toBe(error);
  const callback = jest.fn();
  current().options.authCallback({}, callback);
  const args = jest.mocked(requestRealtimeToken).mock.calls[0];
  expect([...args[1]]).toEqual([]);
  expect(args[2]()).toBe(true);
  closeRealtimeConnection();
  expect(args[2]()).toBe(false);
  expect(mockChannel.subscribe).not.toHaveBeenCalled();
  expect(reportRealtimeFailure).not.toHaveBeenCalled();
});
test('post consumer counts keep capability until both owners release', async () => {
  const first = await subscribeToRealtimeChannel('post:shared', jest.fn());
  const second = await subscribeToRealtimeChannel('post:shared', jest.fn());
  const requested = () => {
    current().options.authCallback({}, jest.fn());
    return [...jest.mocked(requestRealtimeToken).mock.calls.at(-1)![1]];
  };
  first();
  expect(requested()).toEqual(['post:shared']);
  second();
  expect(requested()).toEqual([]);
});
test('capability rejection refreshes once, then retries are bounded', async () => {
  mockChannel.errorReason = { message: 'Channel denied access based on given capability' };
  mockChannel.subscribe.mockRejectedValue(Error('channel rejected'));
  const pending = subscribeToRealtimeChannel('post:denied', jest.fn());
  const rejected = expect(pending).rejects.toThrow('channel rejected');
  await jest.runAllTimersAsync();
  await rejected;
  expect(invalidatePostCapability).toHaveBeenCalledTimes(1);
  expect(mockChannel.subscribe).toHaveBeenCalledTimes(4);
  expect(reportRealtimeFailure).toHaveBeenCalledTimes(1);
});
