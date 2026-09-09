import {
  isRealtimeCapabilityDenied,
  isRealtimeTransportUnavailable,
} from '../../lib/realtimeChannelErrors';

describe('realtime channel error classification', () => {
  it.each([
    'Unable to connect (network unreachable)',
    'Unable to connect (and no more fallback hosts to try)',
    'Connection to server unavailable',
    'Connection to server temporarily unavailable',
  ])('treats recoverable mobile transport loss as non-incident telemetry: %s', (message) => {
    expect(isRealtimeTransportUnavailable(new Error(message))).toBe(true);
  });

  it('recognizes nested Ably transport codes', () => {
    expect(
      isRealtimeTransportUnavailable({
        message: 'Channel operation failed as state is failed',
        errorReason: { code: 80003, message: 'Connection disconnected' },
      }),
    ).toBe(true);
  });

  it('does not suppress authentication or capability failures', () => {
    const denied = {
      code: 40160,
      message: 'Channel denied access based on given capability',
    };
    expect(isRealtimeTransportUnavailable(denied)).toBe(false);
    expect(isRealtimeCapabilityDenied(denied)).toBe(true);
  });

  it('does not suppress unexpected provider failures', () => {
    expect(
      isRealtimeTransportUnavailable({ code: 50001, message: 'Internal channel error' }),
    ).toBe(false);
  });
});
