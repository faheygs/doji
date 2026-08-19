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
  connectTimer = setTimeout(() => {
    connectTimer = null;
    if (client === scheduledClient) scheduledClient.connect();
  }, Math.floor(Math.random() * 2_000));
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
): Promise<() => void> {
  const channel = getClient().channels.get(channelName);
  const listener = (message: Message) => onEvent(eventFromMessage(message));
  await channel.subscribe(listener);
  return () => {
    void channel.unsubscribe(listener);
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
  connectTimer = null;
  client?.close();
  client = null;
}
