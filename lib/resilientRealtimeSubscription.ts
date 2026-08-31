import { subscribeToRealtimeChannel, type DojiRealtimeEvent } from './realtimeClient';
import { isRealtimeAccessUnavailable } from './realtimeAuthorization';
import { recordRealtimeFailure } from './telemetry';

const MAX_RETRY_DELAY_MS = 30_000;

type Options = {
  rewind?: string;
  scope?: 'app' | 'post' | 'public';
  onAccessUnavailable?: () => void;
};

/**
 * Keeps a required socket subscription alive for the lifetime of its consumer.
 * A transient token, radio, or provider failure must not permanently disable
 * realtime until the user navigates away and back.
 */
export function startResilientRealtimeSubscription(
  channelName: string,
  onEvent: (event: DojiRealtimeEvent) => void,
  options: Options = {},
): () => void {
  let disposed = false;
  let unsubscribe: (() => void) | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;

  const connect = async () => {
    try {
      const remove = await subscribeToRealtimeChannel(channelName, onEvent, {
        rewind: options.rewind,
      });
      if (disposed) remove();
      else {
        failures = 0;
        unsubscribe = remove;
      }
    } catch (error) {
      if (disposed) return;
      if (isRealtimeAccessUnavailable(error)) {
        recordRealtimeFailure('subscription_access_changed', error, {
          channelScope: options.scope ?? 'post',
        });
        options.onAccessUnavailable?.();
        return;
      }
      failures += 1;
      recordRealtimeFailure('subscription_recovery', error, {
        channelScope: options.scope ?? 'app',
        attempt: failures,
      });
      const delay = Math.min(MAX_RETRY_DELAY_MS, 1_000 * 2 ** Math.min(failures - 1, 5));
      retryTimer = setTimeout(
        () => {
          retryTimer = null;
          if (!disposed) void connect();
        },
        delay + Math.floor(Math.random() * 750),
      );
    }
  };

  void connect();
  return () => {
    disposed = true;
    if (retryTimer) clearTimeout(retryTimer);
    unsubscribe?.();
  };
}
