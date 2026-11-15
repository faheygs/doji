import { DEFAULT_NOTIFICATION_PREFERENCES, mergeNotificationPreferences, phoneAlertPreferencePatch,
  wantsCategoryEnabled, wantsPushForKind } from '../../lib/notificationPreferences';
import { notificationSettingsRows } from '../../lib/notificationSettingsRows';
import { attentionScopeForItem } from '../../lib/notificationAttention';
import type { NotificationCenterItem } from '../../lib/notificationCenterTypes';

describe('gated social notification settings', () => {
  it('keeps unrelated profile updates compatible with older backends', () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES).not.toHaveProperty('comments_on_posts');
    expect(mergeNotificationPreferences(null)).not.toHaveProperty('late_friend_participation');
    expect(wantsCategoryEnabled({}, 'comments_on_posts')).toBe(false);
    expect(wantsPushForKind({}, 'late_friend_participation')).toBe(false);
  });
  it('only exposes controls when the backend declares the contract enabled', () => {
    expect(notificationSettingsRows(false)).toHaveLength(4);
    const rows = notificationSettingsRows(true);
    expect(rows).toHaveLength(6);
    expect(rows.find(r => r.key === 'mentions_replies')?.description).toContain('replies directly to your comment');
    expect(rows.find(r => r.key === 'comments_on_posts')?.description).toContain('grouped');
  });
  it.each(['comments_on_posts', 'late_friend_participation'] as const)('round-trips %s without enabling other categories', (key) => {
    expect(wantsPushForKind(phoneAlertPreferencePatch(key, true), key)).toBe(true);
    expect(wantsPushForKind(phoneAlertPreferencePatch(key, false), key)).toBe(false);
    expect(wantsPushForKind({ ...phoneAlertPreferencePatch(key, true), push_enabled: false }, key)).toBe(false);
    expect(phoneAlertPreferencePatch(key, true)).not.toHaveProperty('mentions_replies');
  });
  it('honors saved legacy opt-outs until the user explicitly changes the corresponding switch', () => {
    expect(mergeNotificationPreferences({ comments_on_posts: true, comment: false }).comments_on_posts).toBe(false);
    expect(mergeNotificationPreferences({ late_friend_participation: true, friend_post: false }).late_friend_participation).toBe(false);
  });
  it('acknowledges visible comment and friend activity using existing attention scopes', () => {
    expect(attentionScopeForItem({ kind: 'comment', comment_id: 'comment' } as NotificationCenterItem))
      .toEqual({ scope_kind: 'comment', scope_id: 'comment' });
    expect(attentionScopeForItem({ kind: 'friend_activity_group', daily_event_id: 'daily' } as NotificationCenterItem))
      .toEqual({ scope_kind: 'daily_event', scope_id: 'daily' });
  });
});
