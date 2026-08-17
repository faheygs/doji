import {
  buildAblyMessages,
  isPushFresh,
  type DeliveryEvent,
} from '../../supabase/functions/_shared/domain-event-delivery';

function event(overrides: Partial<DeliveryEvent> = {}): DeliveryEvent {
  return {
    id: 'event-1',
    event_type: 'notification.friend.accepted',
    aggregate_id: 'aggregate-1',
    payload: { sendPush: true },
    created_at: '2026-08-15T20:00:00.000Z',
    available_at: '2026-08-15T20:00:00.000Z',
    ...overrides,
  };
}

describe('domain event delivery', () => {
  it('keeps the durable event id in data without an invalid Ably batch id', () => {
    const [message] = buildAblyMessages([event()]);

    expect(message).not.toHaveProperty('id');
    expect(message.data).toMatchObject({
      eventId: 'event-1',
      aggregateId: 'aggregate-1',
      occurredAt: '2026-08-15T20:00:00.000Z',
    });
  });

  it('rejects a social push that is older than five minutes', () => {
    expect(isPushFresh(event(), Date.parse('2026-08-15T20:05:00.001Z'))).toBe(false);
  });

  it('allows a fresh social push', () => {
    expect(isPushFresh(event(), Date.parse('2026-08-15T20:00:30.000Z'))).toBe(true);
  });

  it('rejects an expired Doji activation even inside the generic age limit', () => {
    const activation = event({
      event_type: 'doji.activated',
      payload: {
        broadcastPush: true,
        closesAt: '2026-08-15T20:01:00.000Z',
      },
    });

    expect(isPushFresh(activation, Date.parse('2026-08-15T20:01:00.000Z'))).toBe(false);
  });

  it('never blocks realtime-only events because of age', () => {
    const realtimeOnly = event({ payload: {} });
    expect(isPushFresh(realtimeOnly, Date.parse('2026-08-20T20:00:00.000Z'))).toBe(true);
  });
});
