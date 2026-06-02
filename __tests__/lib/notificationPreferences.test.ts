import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  mergeNotificationPreferences,
  wantsCategoryEnabled,
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
