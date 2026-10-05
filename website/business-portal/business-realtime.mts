// Private invalidation hints only. The authorized read remains the source of truth.
import type { Realtime, TokenRequest, ConnectionStateChange, ChannelStateChange } from 'ably';
import type { BrowserRealtimeSdk as BusinessRealtimeSdk } from '../ably-browser.d.mts';
interface BusinessHint {
  name: 'business.application.updated';
  data: {
    applicationId: string;
    applicantId: string;
    eventId: string;
    aggregateId: string;
    sendPush: false;
    realtimePublished?: true;
    occurredAt: string;
  };
}
interface BusinessRealtimeClient {
  onClear(clear: () => void): () => void;
  hasSession(): boolean;
  epoch(): number;
  realtimeToken(): Promise<{ topic: string; tokenRequest: TokenRequest }>;
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
export function validBusinessMessage(message: unknown, topic: string): message is BusinessHint {
  if (!record(message)) return false;
  const p = message.data;
  return (
    message?.name === 'business.application.updated' &&
    record(p) &&
    uuid(p.applicationId) &&
    uuid(p.applicantId) &&
    uuid(p.eventId) &&
    p.aggregateId === p.applicationId &&
    topic === `business:${p.applicantId}:events` &&
    p.sendPush === false &&
    (p.realtimePublished === undefined || p.realtimePublished === true) &&
    typeof p.occurredAt === 'string' &&
    Number.isFinite(Date.parse(p.occurredAt)) &&
    Object.keys(p).every((key) =>
      [
        'applicationId',
        'applicantId',
        'sendPush',
        'eventId',
        'aggregateId',
        'occurredAt',
        'realtimePublished',
      ].includes(key),
    )
  );
}

export function createBusinessRealtime({
  client,
  enabled,
  loadSdk,
  reconcile,
  status = () => {},
}: {
  client: BusinessRealtimeClient;
  enabled: boolean;
  loadSdk(): Promise<BusinessRealtimeSdk>;
  reconcile(): unknown;
  status?(message: string): void;
}) {
  let generation = 0,
    socket: Realtime | null = null,
    cleanup = () => {},
    starting: Promise<void> | null = null;
  function stop() {
    generation++;
    starting = null;
    const active = socket;
    socket = null;
    try {
      cleanup();
    } catch {
      /* Cleanup failure must never prevent a session lock. */
    }
    cleanup = () => {};
    try {
      active?.close();
    } catch {
      /* Epoch guards already reject every old callback. */
    }
  }
  const unlisten = client.onClear(stop);
  async function start() {
    if (!enabled || !client.hasSession() || socket) return;
    if (starting) return starting;
    const stamp = ++generation,
      epoch = client.epoch();
    const alive = () => stamp === generation && epoch === client.epoch() && client.hasSession();
    starting = (async () => {
      try {
        const initial = await client.realtimeToken();
        if (!alive()) return;
        const Ably = await loadSdk();
        if (!alive()) return;
        let initialToken: TokenRequest | null = initial.tokenRequest;
        const seen = new Set<string>();
        const onHint = (msg: unknown) => {
          if (!alive() || !validBusinessMessage(msg, initial.topic) || seen.has(msg.data.eventId))
            return;
          seen.add(msg.data.eventId);
          if (seen.size > 256) {
            const oldest = seen.values().next();
            if (!oldest.done) seen.delete(oldest.value);
          }
          reconcile();
        };
        const refresh = () => {
          if (alive()) reconcile();
        };
        const onChannel = (change: ChannelStateChange) => {
          if (!alive()) return;
          if (change.current === 'attached' && change.resumed !== true) refresh();
          if (change.current === 'failed') {
            status('Live updates unavailable. Use Refresh.');
            stop();
          }
        };
        const onConnection = (change: ConnectionStateChange) => {
          if (!alive()) return;
          if (change.current === 'connected') {
            status('');
            refresh();
          }
          if (['disconnected', 'suspended'].includes(change.current))
            status('Live updates interrupted. Use Refresh.');
          if (change.current === 'failed') {
            status('Live updates unavailable. Use Refresh.');
            stop();
          }
        };
        socket = new Ably.Realtime({
          autoConnect: false,
          echoMessages: false,
          authCallback: (_params, callback) => {
            if (!alive()) {
              callback('Business session ended', null);
              return;
            }
            if (initialToken) {
              const token = initialToken;
              initialToken = null;
              callback(null, token);
              return;
            }
            void client.realtimeToken().then(
              (result) => {
                if (!alive() || result.topic !== initial.topic) {
                  callback('Business session ended', null);
                  return;
                }
                callback(null, result.tokenRequest);
              },
              () => callback('Business realtime authorization unavailable', null),
            );
          },
        });
        const connection = socket.connection;
        const channel = socket.channels.get(initial.topic, { modes: ['SUBSCRIBE'] });
        cleanup = () => {
          initialToken = null;
          seen.clear();
          channel.unsubscribe();
          channel.off(onChannel);
          connection.off(onConnection);
        };
        connection.on(onConnection);
        channel.on(onChannel);
        socket.connect();
        await channel.subscribe('business.application.updated', onHint);
        if (alive()) refresh(); // Covers the initial read/attach race.
      } catch {
        if (alive()) {
          status('Live updates unavailable. Use Refresh.');
          stop();
        }
      } finally {
        if (stamp === generation) starting = null;
      }
    })();
    return starting;
  }
  return {
    start,
    stop,
    destroy() {
      stop();
      unlisten();
    },
  };
}

let sdkTask: Promise<BusinessRealtimeSdk> | null | undefined;
export function loadBusinessRealtimeSdk() {
  if (window.Ably?.Realtime) return Promise.resolve(window.Ably);
  if (sdkTask) return sdkTask;
  sdkTask = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = setTimeout(() => finish(Error('SDK deadline')), 12000);
    function finish(error: Error | null) {
      clearTimeout(timeout);
      script.onload = script.onerror = null;
      if (error) {
        script.remove();
        sdkTask = null;
        reject(error);
      } else if (window.Ably) resolve(window.Ably);
    }
    script.src = 'https://cdn.ably.com/lib/ably.min-2.26.0.js';
    script.async = true;
    script.onload = () => finish(window.Ably?.Realtime ? null : Error('SDK unavailable'));
    script.onerror = () => finish(Error('SDK unavailable'));
    document.head.append(script);
  });
  return sdkTask;
}
