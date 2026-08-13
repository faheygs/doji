import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  mergeNotificationPreferences,
  wantsCategoryEnabled,
  wantsPushForKind,
} from '../../lib/notificationPreferences';

describe('mergeNotificationPreferences', () => {
  it('defaults friend_request and friend_accepted to true', () => {
    expect(mergeNotificationPreferences(null).friend_request).toBe(true);
    expect(mergeNotificationPreferences(null).friend_accepted).toBe(true);
  });

  it('respects explicit friend_request opt-out', () => {
    expect(mergeNotificationPreferences({ friend_request: false }).friend_request).toBe(false);
  });

  it('respects explicit friend_accepted opt-out', () => {
    expect(mergeNotificationPreferences({ friend_accepted: false }).friend_accepted).toBe(false);
  });
});

describe('wantsCategoryEnabled', () => {
  it('honors friend_accepted preference', () => {
    expect(
      wantsCategoryEnabled(
        { ...DEFAULT_NOTIFICATION_PREFERENCES, friend_accepted: false },
        'friend_accepted',
      ),
    ).toBe(false);
  });
});

describe('wantsPushForKind', () => {
  it('honors the master switch before the category switch', () => {
    expect(
      wantsPushForKind(
        { ...DEFAULT_NOTIFICATION_PREFERENCES, push_enabled: false, comment: true },
        'comment',
      ),
    ).toBe(false);
  });
});

describe('comment_reply preference', () => {
  it('comment_reply defaults to true', () => {
    expect(mergeNotificationPreferences(null).comment_reply).toBe(true);
    expect(DEFAULT_NOTIFICATION_PREFERENCES.comment_reply).toBe(true);
  });

  it('comment_reply opt-out is respected', () => {
    expect(mergeNotificationPreferences({ comment_reply: false }).comment_reply).toBe(false);
    expect(wantsCategoryEnabled({ ...DEFAULT_NOTIFICATION_PREFERENCES, comment_reply: false }, 'comment_reply')).toBe(false);
  });

  it('missing keys fall back to true (new installs without stored prefs)', () => {
    const merged = mergeNotificationPreferences({ comment: true, mention: true });
    expect(merged.comment_reply).toBe(true);
  });
});
