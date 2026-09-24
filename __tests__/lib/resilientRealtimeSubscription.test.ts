const mockSubscribe = jest.fn();
const mockRecord = jest.fn();

jest.mock('../../lib/realtimeClient', () => ({
  subscribeToRealtimeChannel: (...args: unknown[]) => mockSubscribe(...args),
}));
jest.mock('../../lib/telemetry', () => ({
  recordRealtimeFailure: (...args: unknown[]) => mockRecord(...args),
}));

import { RealtimeAccessUnavailableError } from '../../lib/realtimeAuthorization';
import { startResilientRealtimeSubscription } from '../../lib/resilientRealtimeSubscription';

describe('resilient realtime subscription', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('retries a temporary provider failure and keeps the recovered subscription', async () => {
    const remove = jest.fn();
    jest.spyOn(Math, 'random').mockReturnValue(0);
    mockSubscribe
      .mockRejectedValueOnce(new Error('Edge Function returned 503'))
      .mockResolvedValueOnce(remove);

    const stop = startResilientRealtimeSubscription('doji:global', jest.fn(), {
      scope: 'app',
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(mockSubscribe).toHaveBeenCalledTimes(2);

    stop();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('does not retry an authoritative post access loss', async () => {
    const onAccessUnavailable = jest.fn();
    mockSubscribe.mockRejectedValue(
      new RealtimeAccessUnavailableError('post:66666666-6666-4666-8666-666666666666'),
    );

    const stop = startResilientRealtimeSubscription(
      'post:66666666-6666-4666-8666-666666666666',
      jest.fn(),
      {
        scope: 'post',
        onAccessUnavailable,
      },
    );
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(120_000);

    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    expect(onAccessUnavailable).toHaveBeenCalledTimes(1);
    stop();
  });
});
