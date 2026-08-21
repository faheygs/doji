import { Realtime, type ConnectionStateChange, type Message, type TokenRequest } from 'ably';
import { supabase } from './supabase';

export type DojiRealtimeEvent = {
  eventId?: string;
  type: string;
  aggregateId?: string;
  payload: Record<string, unknown>;
};

let client: Realtime | null = null;
let connectTimer: ReturnType<typeof setTimeout> | null = null;
const subscriptionCounts = new Map<string, number>();
const releaseTimers = new Map<string, ReturnType<typeof setTimeout>>();

function getClient(): Realtime {
  if (client) return client;
  client = new Realtime({
    autoConnect: false,
    echoMessages: false,
    authCallback: (_params, callback) => {
      supabase.functions
        .invoke<TokenRequest>('realtime-token')
        .then(({ data, error }) => callback(error?.message ?? null, data ?? null))
        .catch((error: unknown) =>
          callback(error instanceof Error ? error.message : 'Realtime authentication failed', null),
        );
    },
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
  const realtime = getClient();
  const pendingRelease = releaseTimers.get(channelName);
  if (pendingRelease) clearTimeout(pendingRelease);
  releaseTimers.delete(channelName);
  const channel = realtime.channels.get(
    channelName,
    options?.rewind ? { params: { rewind: options.rewind } } : undefined,
  );
  const listener = (message: Message) => onEvent(eventFromMessage(message));
  await channel.subscribe(listener);
  subscriptionCounts.set(channelName, (subscriptionCounts.get(channelName) ?? 0) + 1);
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    channel.unsubscribe(listener);
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
  connectTimer = null;
  client?.close();
  client = null;
}
