import type { DeliveryEvent } from './domain-event-delivery.ts';

export type PushPreferenceKey =
  | 'doji_live'
  | 'friend_requests'
  | 'mentions_replies'
  | 'reviews_account';

export type PushPolicy = {
  mode: 'broadcast' | 'targeted';
  preferenceKey: PushPreferenceKey;
  channelId: 'doji-live' | 'direct-activity' | 'reviews-account';
  interruptionLevel: 'active' | 'time-sensitive';
  scopeKind: 'daily_event' | 'friendship' | 'comment' | 'suggestion';
  scopeId: string;
  collapseKey: string;
};

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * The only event types permitted to leave Doji as an OS notification.
 * Realtime Activity Center delivery is intentionally independent of this list.
 */
export function resolvePushPolicy(event: DeliveryEvent): PushPolicy | null {
  const aggregateId = text(event.aggregate_id);

  if (event.event_type === 'doji.activated' && event.payload.broadcastPush === true) {
    const scopeId = text(event.payload.dailyEventId) ?? aggregateId;
    return scopeId
      ? {
          mode: 'broadcast',
          preferenceKey: 'doji_live',
          channelId: 'doji-live',
          interruptionLevel: 'time-sensitive',
          scopeKind: 'daily_event',
          scopeId,
          collapseKey: `doji-live:${scopeId}`,
        }
      : null;
  }

  if (event.payload.sendPush !== true || !text(event.payload.targetUserId)) return null;

  if (event.event_type === 'notification.friend_request.created') {
    const scopeId = text(event.payload.friendshipId) ?? aggregateId;
    return scopeId
      ? {
          mode: 'targeted',
          preferenceKey: 'friend_requests',
          channelId: 'direct-activity',
          interruptionLevel: 'active',
          scopeKind: 'friendship',
          scopeId,
          collapseKey: `friend-request:${scopeId}`,
        }
      : null;
  }

  if (
    event.event_type === 'notification.mention.created' ||
    event.event_type === 'notification.comment_reply.created'
  ) {
    const scopeId = text(event.payload.commentId) ?? aggregateId;
    return scopeId
      ? {
          mode: 'targeted',
          preferenceKey: 'mentions_replies',
          channelId: 'direct-activity',
          interruptionLevel: 'active',
          scopeKind: 'comment',
          scopeId,
          collapseKey: `comment:${scopeId}`,
        }
      : null;
  }

  if (event.event_type === 'notification.suggestion.reviewed') {
    const scopeId = text(event.payload.suggestionId) ?? aggregateId;
    return scopeId
      ? {
          mode: 'targeted',
          preferenceKey: 'reviews_account',
          channelId: 'reviews-account',
          interruptionLevel: 'active',
          scopeKind: 'suggestion',
          scopeId,
          collapseKey: `challenge-review:${scopeId}`,
        }
      : null;
  }

  return null;
}
