import { prepareSocialPhoneAlert } from '../../supabase/functions/_shared/social-phone-alerts';
import { resolvePushPolicy } from '../../supabase/functions/_shared/notification-policy';
import { pushPreferenceEnabled } from '../../supabase/functions/_shared/notification-preferences';
import { getPushExpiresAtMs } from '../../supabase/functions/_shared/domain-event-delivery';

const event = {
  id: 'event', lease_id: 'lease', aggregate_id: 'post',
  event_type: 'notification.post_comments.grouped_v1',
  created_at: '2026-11-14T12:00:00Z', available_at: '2026-11-14T12:00:30Z',
  payload: { sendPush: true, batchId: 'batch', targetUserId: 'owner', postId: 'post',
    commentId: 'comment', occurredAt: '2026-11-14T12:00:00Z' } as Record<string, unknown>,
};
const prepared = { ...event.payload, body: 'Alex commented on your post',
  attentionOccurredAt: '2026-11-14T12:00:20Z' };
const database = (data: unknown, error: { message: string } | null = null) => ({
  rpc: jest.fn(async () => ({ data, error })),
});

describe('durable social phone alert preparation', () => {
  it('does not add reads or latency to existing notification categories', async () => {
    const db = database(null);
    const existing = { ...event, event_type: 'notification.mention.created' };
    expect(await prepareSocialPhoneAlert(db, existing)).toBe(existing);
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it('fences preparation with the claimed event lease and replaces only the payload', async () => {
    const db = database(prepared);
    const result = await prepareSocialPhoneAlert(db, event);
    expect(db.rpc).toHaveBeenCalledWith('prepare_social_phone_alert_v1', { p_event_id: 'event', p_lease_id: 'lease' });
    expect(result).toEqual({ ...event, payload: prepared });
    expect(event.payload).not.toHaveProperty('body');
    expect(getPushExpiresAtMs(result)).toBe(getPushExpiresAtMs(event));
  });
  it('suppresses an ineligible batch without fabricating an empty message', async () => {
    const result = await prepareSocialPhoneAlert(database(null), event);
    expect(resolvePushPolicy(result)).toBeNull();
  });
  it('fails closed on read errors instead of sending stale material', async () => {
    await expect(prepareSocialPhoneAlert(database(null, { message: 'private diagnostic' }), event))
      .rejects.toThrow('Social notification preparation failed');
  });
  it.each([undefined, [], 'invalid', {}, { ...prepared, targetUserId: 'other' },
    { ...prepared, batchId: 'other' }, { ...prepared, sendPush: false },
    { ...prepared, body: 42 }, { ...prepared, occurredAt: '2026-11-14T12:01:00Z' }])
  ('rejects malformed or identity/TTL-changing preparation %#', async (data) => {
    await expect(prepareSocialPhoneAlert(database(data), event)).rejects.toThrow();
  });
});

describe('separate opt-in social categories', () => {
  it.each(['comments_on_posts', 'late_friend_participation'])('%s is not a legacy implicit opt-in', (key) => {
    expect(pushPreferenceEnabled(null, key)).toBe(false);
    expect(pushPreferenceEnabled({}, key)).toBe(false);
    expect(pushPreferenceEnabled({ [key]: 'true' }, key)).toBe(false);
    expect(pushPreferenceEnabled({ [key]: true }, key)).toBe(true);
    expect(pushPreferenceEnabled({ [key]: true, push_enabled: false }, key)).toBe(false);
  });
  it('honors the older corresponding category opt-outs', () => {
    expect(pushPreferenceEnabled({ comments_on_posts: true, comment: false }, 'comments_on_posts')).toBe(false);
    expect(pushPreferenceEnabled({ late_friend_participation: true, friend_post: false }, 'late_friend_participation')).toBe(false);
  });
  it('uses normal-priority grouped scopes, separate from direct comment notifications', () => {
    expect(resolvePushPolicy(event)).toMatchObject({ preferenceKey: 'comments_on_posts',
      interruptionLevel: 'active', scopeKind: 'comment', scopeId: 'comment', collapseKey: 'post-comments:post' });
    const late = { ...event, event_type: 'notification.late_friend_activity.grouped_v1',
      payload: { ...event.payload, dailyEventId: 'daily' } };
    expect(resolvePushPolicy(late)).toMatchObject({ preferenceKey: 'late_friend_participation',
      scopeKind: 'daily_event', scopeId: 'daily', collapseKey: 'late-friends:daily' });
    expect(resolvePushPolicy({ ...event, payload: { ...event.payload, batchId: null } })).toBeNull();
    expect(resolvePushPolicy({ ...event, payload: { ...event.payload, postId: null } })).toBeNull();
  });
});
