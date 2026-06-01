import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  mergeNotificationPreferences,
  wantsCategoryEnabled,
} from '../../lib/notificationPreferences';

describe('mergeNotificationPreferences', () => {
  it('defaults new_follower to true', () => {
    expect(mergeNotificationPreferences(null).new_follower).toBe(true);
  });

  it('respects explicit new_follower opt-out', () => {
    expect(mergeNotificationPreferences({ new_follower: false }).new_follower).toBe(false);
  });
});

describe('wantsCategoryEnabled', () => {
  it('maps follow_accepted to friend_accepted preference', () => {
    expect(
      wantsCategoryEnabled(
        { ...DEFAULT_NOTIFICATION_PREFERENCES, friend_accepted: false },
        'follow_accepted',
      ),
    ).toBe(false);
  });

  it('allows new_follower when enabled', () => {
    expect(wantsCategoryEnabled(DEFAULT_NOTIFICATION_PREFERENCES, 'new_follower')).toBe(true);
  });
});
