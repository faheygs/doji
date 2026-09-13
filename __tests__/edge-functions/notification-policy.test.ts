import { resolvePushPolicy } from '../../supabase/functions/_shared/notification-policy';
import type { DeliveryEvent } from '../../supabase/functions/_shared/domain-event-delivery';

const event = (
  event_type: string,
  payload: Record<string, unknown> = {},
  aggregate_id = 'aggregate-1',
): DeliveryEvent => ({
  id: 'event-1',
  event_type,
  aggregate_id,
  payload,
  created_at: '2026-09-09T12:00:00.000Z',
  available_at: '2026-09-09T12:00:00.000Z',
});

describe('OS notification allowlist', () => {
  it.each([
    'notification.friend_activity.grouped',
    'notification.reactions.grouped',
    'notification.comment.created',
    'notification.reaction.updated',
    'notification.friend_accepted.created',
    'notification.badge.unlocked',
  ])('keeps %s out of the phone tray', (eventType) => {
    expect(resolvePushPolicy(event(eventType, { sendPush: true, targetUserId: 'user-1' })))
      .toBeNull();
  });

  it('authorizes friend requests with a stable subject and channel', () => {
    expect(resolvePushPolicy(event('notification.friend_request.created', {
      sendPush: true,
      targetUserId: 'user-1',
      friendshipId: 'friendship-1',
    }))).toMatchObject({
      preferenceKey: 'friend_requests',
      scopeKind: 'friendship',
      scopeId: 'friendship-1',
      channelId: 'direct-activity',
    });
  });

  it.each(['notification.mention.created', 'notification.comment_reply.created'])
  ('authorizes %s as direct activity', (eventType) => {
    expect(resolvePushPolicy(event(eventType, {
      sendPush: true,
      targetUserId: 'user-1',
      commentId: 'comment-1',
    }))).toMatchObject({
      preferenceKey: 'mentions_replies',
      scopeKind: 'comment',
      scopeId: 'comment-1',
    });
  });

  it('only authorizes a Doji broadcast for the activation event', () => {
    expect(resolvePushPolicy(event('doji.activated', {
      broadcastPush: true,
      dailyEventId: 'daily-1',
    }))).toMatchObject({
      mode: 'broadcast',
      preferenceKey: 'doji_live',
      interruptionLevel: 'time-sensitive',
    });
    expect(resolvePushPolicy(event('notification.badge.unlocked', {
      broadcastPush: true,
      dailyEventId: 'daily-1',
    }))).toBeNull();
  });
});
