import type { NotificationPreferences } from '../types/database';

export type NotificationPreferenceKind = Exclude<
  keyof NotificationPreferences,
  'push_enabled'
>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  push_enabled: true,
  show_bell_badge: true,
  doji_start: true,
  friend_post: true,
  reactions_on_my_post: true,
  friend_request: true,
  friend_accepted: true,
  badges: true,
  comment: true,
  mention: true,
  follow_request: true,
  suggestion: true,
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
    show_bell_badge: o.show_bell_badge !== false,
    doji_start: o.doji_start !== false,
    friend_post: o.friend_post !== false,
    reactions_on_my_post: o.reactions_on_my_post !== false,
    friend_request: o.friend_request !== false,
    friend_accepted: o.friend_accepted !== false,
    badges: o.badges !== false,
    comment: o.comment !== false,
    mention: o.mention !== false,
    follow_request: o.follow_request !== false && o.friend_request !== false,
    suggestion: o.suggestion !== false,
  };
}

/** Category toggles only (OS permission is checked in the client before scheduling). */
export function wantsCategoryEnabled(
  prefs: NotificationPreferences | Record<string, unknown> | null | undefined,
  kind: NotificationPreferenceKind,
): boolean {
  const p = mergeNotificationPreferences(prefs);
  return p[kind] !== false;
}

/** @deprecated Use wantsCategoryEnabled; push_enabled is no longer used for gating. */
export function wantsPushForKind(
  prefs: NotificationPreferences | Record<string, unknown> | null | undefined,
  kind: NotificationPreferenceKind,
): boolean {
  return wantsCategoryEnabled(prefs, kind);
}
