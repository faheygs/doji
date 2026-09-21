import fs from 'fs';
import path from 'path';

import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  mergeNotificationPreferences,
  wantsCategoryEnabled,
  wantsPushForKind,
  phoneAlertPreferencePatch,
} from '../../lib/notificationPreferences';

describe('notification preference database contract', () => {
  it('allows every preference key written by the mobile client', () => {
    const migrationsDirectory = path.resolve(__dirname, '../../supabase/migrations');
    const updateProfileMigrations = fs
      .readdirSync(migrationsDirectory)
      .sort()
      .filter((fileName) => fileName.endsWith('.sql'))
      .map((fileName) => fs.readFileSync(path.join(migrationsDirectory, fileName), 'utf8'))
      .filter((sql) => /create\s+or\s+replace\s+function\s+public\.update_own_profile/i.test(sql));
    const latestUpdateProfileDefinition = updateProfileMigrations.at(-1);

    expect(latestUpdateProfileDefinition).toBeDefined();
    for (const key of Object.keys(DEFAULT_NOTIFICATION_PREFERENCES)) {
      expect(latestUpdateProfileDefinition).toContain(`'${key}'`);
    }
  });
});

describe('mergeNotificationPreferences', () => {
  it('defaults the four phone-alert categories to true', () => {
    expect(mergeNotificationPreferences(null)).toMatchObject({
      doji_live: true,
      friend_requests: true,
      mentions_replies: true,
      reviews_account: true,
    });
  });

  it('carries legacy opt-outs into the new categories', () => {
    expect(mergeNotificationPreferences({ doji_start: false }).doji_live).toBe(false);
    expect(mergeNotificationPreferences({ friend_request: false }).friend_requests).toBe(false);
    expect(mergeNotificationPreferences({ mention: false }).mentions_replies).toBe(false);
    expect(mergeNotificationPreferences({ suggestion: false }).reviews_account).toBe(false);
  });

  it('dual-writes settings for already-installed clients', () => {
    expect(phoneAlertPreferencePatch('mentions_replies', false)).toEqual({
      mentions_replies: false,
      mention: false,
      comment_reply: false,
    });
  });

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
