import { Realtime, type ConnectionStateChange, type Message } from 'ably';
import { recordRealtimeFailure, reportRealtimeFailure } from './telemetry';
import {
  ensurePostCapability,
  requestRealtimeToken,
  resetRealtimeAuthorization,
  isRealtimeAccessUnavailable,
  invalidatePostCapability,
} from './realtimeAuthorization';
import { isRealtimeCapabilityDenied } from './realtimeChannelErrors';

export type DojiRealtimeEvent = {
  eventId?: string;
  type: string;
  aggregateId?: string;
  payload: Record<string, unknown>;
};

let client: Realtime | null = null;
let connectTimer: ReturnType<typeof setTimeout> | null = null;
let failedReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let consecutiveConnectionFailures = 0;
const subscriptionCounts = new Map<string, number>();
const releaseTimers = new Map<string, ReturnType<typeof setTimeout>>();
const postConsumerCounts = new Map<string, number>();
const requestedPostChannels = new Set<string>();
const SUBSCRIBE_ATTEMPTS = 4;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function retainPostChannel(channelName: string): void {
  postConsumerCounts.set(channelName, (postConsumerCounts.get(channelName) ?? 0) + 1);
  requestedPostChannels.add(channelName);
}

function releasePostChannel(channelName: string): void {
  const remaining = Math.max(0, (postConsumerCounts.get(channelName) ?? 1) - 1);
  if (remaining > 0) {
    postConsumerCounts.set(channelName, remaining);
    return;
  }
  postConsumerCounts.delete(channelName);
  requestedPostChannels.delete(channelName);
}

function getClient(): Realtime {
  if (client) return client;
  let createdClient: Realtime | null = null;
  const realtime = new Realtime({
    autoConnect: false,
    echoMessages: false,
    realtimeRequestTimeout: 20_000,
    authCallback: (_params, callback) => {
      const expected = createdClient ?? realtime;
      requestRealtimeToken(expected, requestedPostChannels, () => client === expected, callback);
    },
  });
  createdClient = realtime;
  client = realtime;
  client.connection.on((change) => {
    if (change.current === 'connected') {
      consecutiveConnectionFailures = 0;
      if (failedReconnectTimer) clearTimeout(failedReconnectTimer);
      failedReconnectTimer = null;
      return;
    }
    if (change.current !== 'failed' && change.current !== 'suspended') return;
    recordRealtimeFailure('connection_state', change.reason, { state: change.current });
    if (change.current !== 'failed' || client !== realtime) return;

    consecutiveConnectionFailures += 1;
    if (consecutiveConnectionFailures >= 3) {
      reportRealtimeFailure('connection_recovery_exhausted', change.reason, {
        state: change.current,
        attempt: consecutiveConnectionFailures,
      });
    }
    if (failedReconnectTimer) return;
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(4, consecutiveConnectionFailures - 1));
    failedReconnectTimer = setTimeout(
      () => {
        failedReconnectTimer = null;
        if (client !== realtime) return;
        resetRealtimeAuthorization();
        realtime.connect();
      },
      delay + Math.floor(Math.random() * 750),
    );
  });
  const scheduledClient = client;
  // Spread cold-start connection attempts across a short window. This is
  // invisible beside normal feed hydration but prevents a push-open wave from
  // creating one synchronized token/connection spike.
  connectTimer = setTimeout(
    () => {
      connectTimer = null;
      if (client === scheduledClient) scheduledClient.connect();
    },
    Math.floor(Math.random() * 2_000),
  );
  return client;
}

function eventFromMessage(message: Message): DojiRealtimeEvent {
  const payload = (message.data ?? {}) as Record<string, unknown>;
  return {
    eventId: typeof payload.eventId === 'string' ? payload.eventId : message.id,
    type: message.name || 'state.updated',
    aggregateId: typeof payload.aggregateId === 'string' ? payload.aggregateId : undefined,
    payload,
  };
}

export async function subscribeToRealtimeChannel(
  channelName: string,
  onEvent: (event: DojiRealtimeEvent) => void,
  options?: { rewind?: string },
): Promise<() => void> {
  const isPostChannel = channelName.startsWith('post:');
  if (isPostChannel) retainPostChannel(channelName);
  const realtime = getClient();
  const pendingRelease = releaseTimers.get(channelName);
  if (pendingRelease) clearTimeout(pendingRelease);
  releaseTimers.delete(channelName);
  const getChannel = () =>
    realtime.channels.get(
      channelName,
      options?.rewind ? { params: { rewind: options.rewind } } : undefined,
    );
  let channel = getChannel();
  const listener = (message: Message) => onEvent(eventFromMessage(message));
  let lastError: unknown;
  let refreshedDeniedCapability = false;
  for (let attempt = 1; attempt <= SUBSCRIBE_ATTEMPTS; attempt += 1) {
    try {
      if (isPostChannel) {
        await ensurePostCapability(realtime, channelName, () => client === realtime);
      }
      await channel.subscribe(listener);
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      channel.unsubscribe(listener);
      const capabilityDenied =
        isRealtimeCapabilityDenied(error) || isRealtimeCapabilityDenied(channel.errorReason);
      if (isPostChannel && capabilityDenied && !refreshedDeniedCapability) {
        refreshedDeniedCapability = true;
        invalidatePostCapability(channelName);
        recordRealtimeFailure('channel_capability_refresh', error, { channelScope: 'post' });
        if (channel.state === 'failed') realtime.channels.release(channelName);
        channel = getChannel();
        continue;
      }
      if (isRealtimeAccessUnavailable(error)) {
        recordRealtimeFailure('channel_access_changed', error, { channelScope: 'post' });
        break;
      }
      recordRealtimeFailure('channel_subscribe_retry', error, {
        channelScope: isPostChannel ? 'post' : 'app',
        attempt,
      });
      if (client !== realtime || attempt === SUBSCRIBE_ATTEMPTS) break;
      if (channel.state === 'failed') {
        realtime.channels.release(channelName);
        channel = getChannel();
      }
      await wait(500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 350));
    }
  }
  if (lastError) {
    if (isPostChannel) releasePostChannel(channelName);
    if (!isRealtimeAccessUnavailable(lastError)) {
      reportRealtimeFailure('channel_subscribe_exhausted', lastError, {
        channelScope: isPostChannel ? 'post' : 'app',
      });
    }
    throw lastError;
  }
  subscriptionCounts.set(channelName, (subscriptionCounts.get(channelName) ?? 0) + 1);
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    channel.unsubscribe(listener);
    if (isPostChannel) releasePostChannel(channelName);
    const remaining = Math.max(0, (subscriptionCounts.get(channelName) ?? 1) - 1);
    if (remaining > 0) {
      subscriptionCounts.set(channelName, remaining);
      return;
    }
    subscriptionCounts.delete(channelName);
    // Defer one task so a same-transition remount can retain the attachment.
    // Otherwise detach immediately; keeping an empty attached channel would
    // both leak transport resources and create an unreplayable listener gap.
    const timer = setTimeout(() => {
      releaseTimers.delete(channelName);
      if (subscriptionCounts.has(channelName) || client !== realtime) return;
      void channel
        .detach()
        .catch(() => undefined)
        .finally(() => {
          if (!subscriptionCounts.has(channelName) && client === realtime) {
            realtime.channels.release(channelName);
          }
        });
    }, 0);
    releaseTimers.set(channelName, timer);
  };
}

export function onRealtimeConnectionChange(
  listener: (change: ConnectionStateChange) => void,
): () => void {
  const realtime = getClient();
  realtime.connection.on(listener);
  return () => realtime.connection.off(listener);
}

export function closeRealtimeConnection(): void {
  if (connectTimer) clearTimeout(connectTimer);
  if (failedReconnectTimer) clearTimeout(failedReconnectTimer);
  for (const timer of releaseTimers.values()) clearTimeout(timer);
  releaseTimers.clear();
  subscriptionCounts.clear();
  postConsumerCounts.clear();
  requestedPostChannels.clear();
  resetRealtimeAuthorization();
  connectTimer = null;
  failedReconnectTimer = null;
  consecutiveConnectionFailures = 0;
  client?.close();
  client = null;
}
