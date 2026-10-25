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
    'Connection closed',
    'Channel operation failed: Connection disconnected',
    'Channel attach timed out',
    'Realtime authentication timed out after 15000ms',
    'Realtime authorization was superseded',
  ])('treats recoverable mobile transport loss as non-incident telemetry: %s', (message) => {
    expect(isRealtimeTransportUnavailable(new Error(message))).toBe(true);
  });

  it.each([
    'fetch failed: FetchRequestCanceledException',
    'Network request failed',
    'The request was aborted',
  ])('treats handset fetch cancellation as transport state: %s', (message) => {
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

  it('recognizes a wrapped intentional connection closure', () => {
    expect(
      isRealtimeTransportUnavailable({
        message: 'Channel operation failed',
        cause: new Error('Connection closed'),
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
    expect(isRealtimeTransportUnavailable({ code: 80019, statusCode: 401,
      message: 'Client configured authentication provider request failed' })).toBe(false);
  });

  it('classifies the nested fallback deadline, not its misleading auth wrapper', () => {
    expect(isRealtimeTransportUnavailable({ code: 80019, statusCode: 401,
      message: 'Client configured authentication provider request failed',
      cause: { cause: new Error('Timeout for trying fallback hosts retries. Total elapsed time exceeded the 15000ms limit') },
    })).toBe(true);
  });

  it('does not suppress unexpected provider failures', () => {
    expect(isRealtimeTransportUnavailable({ code: 50001, message: 'Internal channel error' })).toBe(
      false,
    );
  });
});
