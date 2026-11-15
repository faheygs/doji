import type { DeliveryEvent } from './domain-event-delivery.ts';

export const SOCIAL_PHONE_EVENT_TYPES = [
  'notification.post_comments.grouped_v1',
  'notification.late_friend_activity.grouped_v1',
] as const;

type SocialPhoneDatabase = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{
    data: unknown; error: { message: string } | null;
  }>;
};

/** Resolve bounded, current eligibility only after the collection window closes. */
export async function prepareSocialPhoneAlert<T extends DeliveryEvent & { lease_id: string }>(
  database: SocialPhoneDatabase,
  event: T,
): Promise<T | null> {
  if (!SOCIAL_PHONE_EVENT_TYPES.some((type) => type === event.event_type)) return event;
  const { data, error } = await database.rpc('prepare_social_phone_alert_v1', {
    p_event_id: event.id, p_lease_id: event.lease_id,
  });
  if (error) throw new Error('Social notification preparation failed');
  if (data === null) return { ...event, payload: { ...event.payload, sendPush: false } };
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Invalid social notification preparation');
  }
  const payload = data as Record<string, unknown>;
  if (payload.deferred === true) {
    if (event.event_type !== 'notification.late_friend_activity.grouped_v1' ||
        payload.eventId !== event.id || payload.leaseId !== event.lease_id ||
        !Number.isFinite(Date.parse(String(payload.availableAt)))) {
      throw new Error('Invalid social notification deferral');
    }
    return null;
  }
  if (payload.targetUserId !== event.payload.targetUserId || payload.batchId !== event.payload.batchId ||
      payload.sendPush !== true || typeof payload.body !== 'string' ||
      Date.parse(String(payload.occurredAt)) !== Date.parse(String(event.payload.occurredAt))) {
    throw new Error('Social notification identity or expiration changed');
  }
  return { ...event, payload };
}
