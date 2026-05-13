import type { NotificationPreferences } from '../types/database';

export type NotificationPreferenceKind = Exclude<
  keyof NotificationPreferences,
  'push_enabled'
>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  push_enabled: true,
  doji_start: true,
  friend_post: true,
  reactions_on_my_post: true,
  friend_request: true,
  friend_accepted: true,
  badges: true,
};

export function mergeNotificationPreferences(
  raw: NotificationPreferences | Record<string, unknown> | null | undefined,
): NotificationPreferences {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
  const o = raw as Record<string, unknown>;
  const d = DEFAULT_NOTIFICATION_PREFERENCES;
  return {
    push_enabled: o.push_enabled !== false,
    doji_start: o.doji_start !== false,
    friend_post: o.friend_post !== false,
    reactions_on_my_post: o.reactions_on_my_post !== false,
    friend_request: o.friend_request !== false,
    friend_accepted: o.friend_accepted !== false,
    badges: o.badges !== false,
  };
}

/** For local notifications: master + category must be on. */
export function wantsPushForKind(
  prefs: NotificationPreferences | Record<string, unknown> | null | undefined,
  kind: NotificationPreferenceKind,
): boolean {
  const p = mergeNotificationPreferences(prefs);
  if (!p.push_enabled) return false;
  return p[kind] !== false;
}
