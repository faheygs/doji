const mockChannel = {
  subscribe: jest.fn().mockResolvedValue(undefined),
  unsubscribe: jest.fn(),
  detach: jest.fn().mockResolvedValue(undefined),
};
const mockRelease = jest.fn();
const mockClose = jest.fn();

jest.mock('ably', () => ({
  Realtime: jest.fn().mockImplementation(() => ({
    channels: { get: jest.fn(() => mockChannel), release: mockRelease },
    connection: { on: jest.fn(), off: jest.fn() },
    connect: jest.fn(),
    close: mockClose,
  })),
}));
jest.mock('../../lib/supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

import {
  closeRealtimeConnection,
  subscribeToRealtimeChannel,
} from '../../lib/realtimeClient';

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
    const removeFirst = await subscribeToRealtimeChannel('post:1', jest.fn(), {
      rewind: '10s',
    });
    const removeSecond = await subscribeToRealtimeChannel('post:1', jest.fn(), {
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
    expect(mockRelease).toHaveBeenCalledWith('post:1');

    removeSecond();
    expect(mockChannel.detach).toHaveBeenCalledTimes(1);
  });
});
