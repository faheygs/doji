export type DeliveryEvent = {
  id: string;
  event_type: string;
  aggregate_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  available_at: string;
};

const DOJI_PUSH_MAX_AGE_MS = 2 * 60_000;
const SOCIAL_PUSH_MAX_AGE_MS = 5 * 60_000;

function dateMs(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

export function buildAblyMessages(events: DeliveryEvent[]) {
  return events.map((event) => ({
    name: event.event_type,
    data: {
      ...event.payload,
      eventId: event.id,
      aggregateId: event.aggregate_id,
      occurredAt: event.created_at,
    },
  }));
}

export function isPushFresh(event: DeliveryEvent, nowMs = Date.now()): boolean {
  if (event.payload.sendPush !== true && event.payload.broadcastPush !== true) return true;

  const expiresAtMs = getPushExpiresAtMs(event, nowMs);
  return expiresAtMs !== null && nowMs < expiresAtMs;
}

export function getPushExpiresAtMs(event: DeliveryEvent, nowMs = Date.now()): number | null {

  // Asynchronous friend fanout creates child outbox rows after the original
  // action. Freshness follows the source action so a backlog can never turn an
  // old reaction/comment into a new phone alert.
  const createdMs = dateMs(event.payload.occurredAt) ?? dateMs(event.created_at);
  if (createdMs === null || createdMs > nowMs + 30_000) return null;

  if (event.event_type === 'doji.activated') {
    const closesMs = dateMs(event.payload.closesAt);
    return Math.min(createdMs + DOJI_PUSH_MAX_AGE_MS, closesMs ?? Number.POSITIVE_INFINITY);
  }

  return createdMs + SOCIAL_PUSH_MAX_AGE_MS;
}
