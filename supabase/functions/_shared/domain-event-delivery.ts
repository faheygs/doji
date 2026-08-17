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

  const createdMs = dateMs(event.created_at);
  if (createdMs === null || createdMs > nowMs + 30_000) return false;

  if (event.event_type === 'doji.activated') {
    const closesMs = dateMs(event.payload.closesAt);
    if (closesMs !== null && nowMs >= closesMs) return false;
    return nowMs - createdMs <= DOJI_PUSH_MAX_AGE_MS;
  }

  return nowMs - createdMs <= SOCIAL_PUSH_MAX_AGE_MS;
}
