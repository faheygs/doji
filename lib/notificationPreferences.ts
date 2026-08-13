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
  suggestion: true,
  comment_reply: true,
};

export function mergeNotificationPreferences(
  raw: NotificationPreferences | Record<string, unknown> | null | undefined,
): NotificationPreferences {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
  const o = raw as Record<string, unknown>;
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
    suggestion: o.suggestion !== false,
    comment_reply: o.comment_reply !== false,
  };
}

/** Category setting only; useful for rendering individual preference controls. */
export function wantsCategoryEnabled(
  prefs: NotificationPreferences | Record<string, unknown> | null | undefined,
  kind: NotificationPreferenceKind,
): boolean {
  const p = mergeNotificationPreferences(prefs);
  return p[kind] !== false;
}

/** Whether push delivery is enabled by both the master and category settings. */
export function wantsPushForKind(
  prefs: NotificationPreferences | Record<string, unknown> | null | undefined,
  kind: NotificationPreferenceKind,
): boolean {
  const p = mergeNotificationPreferences(prefs);
  return p.push_enabled && p[kind] !== false;
}
