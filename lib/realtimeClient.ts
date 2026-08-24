import { Realtime, type ConnectionStateChange, type Message, type TokenRequest } from 'ably';
import { supabase } from './supabase';
import { reportRealtimeFailure } from './telemetry';

export type DojiRealtimeEvent = {
  eventId?: string;
  type: string;
  aggregateId?: string;
  payload: Record<string, unknown>;
};

let client: Realtime | null = null;
let connectTimer: ReturnType<typeof setTimeout> | null = null;
let authorizationTask: { realtime: Realtime; promise: Promise<void> } | null = null;
const subscriptionCounts = new Map<string, number>();
const releaseTimers = new Map<string, ReturnType<typeof setTimeout>>();
const postConsumerCounts = new Map<string, number>();
const requestedPostChannels = new Set<string>();
let grantedPostChannels = new Set<string>();
let lastAuthorizationRequestedChannels = new Set<string>();

function grantedPostChannelsFromToken(token: TokenRequest): Set<string> {
  try {
    const capability = JSON.parse(token.capability) as Record<string, unknown>;
    return new Set(Object.keys(capability).filter((channelName) => channelName.startsWith('post:')));
  } catch {
    return new Set();
  }
}

function requestedPostIds(): string[] {
  return [...requestedPostChannels].map((channelName) => channelName.slice('post:'.length));
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
    authCallback: (_params, callback) => {
      const requestedSnapshot = new Set(requestedPostChannels);
      supabase.functions
        .invoke<TokenRequest>('realtime-token', { body: { postIds: requestedPostIds() } })
        .then(({ data, error }) => {
          if (error || !data) {
            reportRealtimeFailure('token_request', error ?? new Error('Empty token response'));
          }
          if (!error && data && client === createdClient) {
            lastAuthorizationRequestedChannels = requestedSnapshot;
            grantedPostChannels = grantedPostChannelsFromToken(data);
          }
          callback(error?.message ?? null, data ?? null);
        })
        .catch((error: unknown) => {
          reportRealtimeFailure('token_request', error);
          callback(error instanceof Error ? error.message : 'Realtime authentication failed', null);
        });
    },
  });
  createdClient = realtime;
  client = realtime;
  client.connection.on((change) => {
    if (change.current !== 'failed' && change.current !== 'suspended') return;
    reportRealtimeFailure('connection_state', change.reason, { state: change.current });
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

async function ensurePostCapability(realtime: Realtime, channelName: string): Promise<void> {
  while (!grantedPostChannels.has(channelName)) {
    let task = authorizationTask;
    if (!task || task.realtime !== realtime) {
      // Mounted cards share one authorization. If another card arrives after
      // its post set was captured, the loop performs one trailing request that
      // includes the late card instead of treating it as denied.
      let promise: Promise<void>;
      promise = Promise.resolve()
        .then(() => realtime.auth.authorize())
        .then(() => undefined)
        .finally(() => {
          if (authorizationTask?.promise === promise) authorizationTask = null;
        });
      task = { realtime, promise };
      authorizationTask = task;
    }
    await task.promise;
    if (client !== realtime) throw new Error('Realtime connection changed');
    if (
      !grantedPostChannels.has(channelName) &&
      lastAuthorizationRequestedChannels.has(channelName)
    ) {
      throw new Error('Realtime access to this post is unavailable');
    }
  }
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
  try {
    if (isPostChannel) await ensurePostCapability(realtime, channelName);
  } catch (error) {
    if (isPostChannel) releasePostChannel(channelName);
    reportRealtimeFailure('post_authorization', error, { channelScope: 'post' });
    throw error;
  }
  const pendingRelease = releaseTimers.get(channelName);
  if (pendingRelease) clearTimeout(pendingRelease);
  releaseTimers.delete(channelName);
  const channel = realtime.channels.get(
    channelName,
    options?.rewind ? { params: { rewind: options.rewind } } : undefined,
  );
  const listener = (message: Message) => onEvent(eventFromMessage(message));
  try {
    await channel.subscribe(listener);
  } catch (error) {
    if (isPostChannel) releasePostChannel(channelName);
    reportRealtimeFailure('channel_subscribe', error, {
      channelScope: isPostChannel ? 'post' : 'app',
    });
    throw error;
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
  for (const timer of releaseTimers.values()) clearTimeout(timer);
  releaseTimers.clear();
  subscriptionCounts.clear();
  postConsumerCounts.clear();
  requestedPostChannels.clear();
  grantedPostChannels = new Set();
  lastAuthorizationRequestedChannels = new Set();
  authorizationTask = null;
  connectTimer = null;
  client?.close();
  client = null;
}
