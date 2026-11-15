import type { DeliveryEvent } from './domain-event-delivery.ts';

export type PushPreferenceKey =
  | 'doji_live'
  | 'friend_requests'
  | 'mentions_replies'
  | 'comments_on_posts'
  | 'late_friend_participation'
  | 'reviews_account';

export type PushPolicy = {
  mode: 'broadcast' | 'targeted';
  preferenceKey: PushPreferenceKey;
  channelId: 'doji-live' | 'direct-activity' | 'reviews-account';
  interruptionLevel: 'active' | 'time-sensitive';
  scopeKind: 'daily_event' | 'friendship' | 'comment' | 'suggestion' | 'moderation_decision';
  scopeId: string;
  collapseKey: string;
};

/** Preserve exact navigation identity and the snapshot covered by daily alerts. */
export function notificationDataForEvent(event: DeliveryEvent, policy: PushPolicy): Record<string, string> {
  return {
    type: String(event.payload.type ?? (event.event_type === 'doji.activated' ? 'CHALLENGE' : 'ACTIVITY')),
    eventId: event.id,
    daily_event_id: event.payload.dailyEventId ? String(event.payload.dailyEventId) : '',
    postId: event.payload.postId ? String(event.payload.postId) : '',
    commentId: event.payload.commentId ? String(event.payload.commentId) : '',
    voteId: event.payload.voteId ? String(event.payload.voteId) : '',
    url: event.payload.url ? String(event.payload.url) : '',
    notificationScopeKind: policy.scopeKind,
    notificationScopeId: policy.scopeId,
    ...(policy.scopeKind === 'daily_event' ? {
      notificationObservedThrough: String(event.payload.attentionOccurredAt ?? event.payload.occurredAt ?? event.created_at),
    } : {}),
  };
}

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

  if (text(event.payload.batchId)) {
    const comments = event.event_type === 'notification.post_comments.grouped_v1';
    const late = event.event_type === 'notification.late_friend_activity.grouped_v1';
    const subject = text(comments ? event.payload.postId : event.payload.dailyEventId);
    const scopeId = comments ? text(event.payload.commentId) : subject;
    if ((comments || late) && subject && scopeId) return {
      mode: 'targeted', preferenceKey: comments ? 'comments_on_posts' : 'late_friend_participation',
      channelId: 'direct-activity', interruptionLevel: 'active',
      scopeKind: comments ? 'comment' : 'daily_event', scopeId,
      collapseKey: `${comments ? 'post-comments' : 'late-friends'}:${subject}`,
    };
  }

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

  if (event.event_type === 'moderation.status.changed') {
    const scopeId = text(event.payload.decisionId) ?? aggregateId;
    return scopeId
      ? {
          mode: 'targeted',
          preferenceKey: 'reviews_account',
          channelId: 'reviews-account',
          interruptionLevel: 'active',
          scopeKind: 'moderation_decision',
          scopeId,
          collapseKey: `moderation-decision:${scopeId}`,
        }
      : null;
  }

  return null;
}
