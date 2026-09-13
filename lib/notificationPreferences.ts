import type { NotificationPreferences } from '../types/database';

export type NotificationPreferenceKind = Exclude<
  keyof NotificationPreferences,
  'push_enabled'
>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  push_enabled: true,
  show_bell_badge: true,
  doji_live: true,
  friend_requests: true,
  mentions_replies: true,
  reviews_account: true,
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
  const mentionsReplies = o.mentions_replies !== false &&
    o.mention !== false && o.comment_reply !== false;
  return {
    push_enabled: o.push_enabled !== false,
    show_bell_badge: o.show_bell_badge !== false,
    doji_live: o.doji_live !== false && o.doji_start !== false,
    friend_requests: o.friend_requests !== false && o.friend_request !== false,
    mentions_replies: mentionsReplies,
    reviews_account: o.reviews_account !== false && o.suggestion !== false,
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

/** Dual-write aliases until every pre-policy mobile build has aged out. */
export function phoneAlertPreferencePatch(
  kind: 'doji_live' | 'friend_requests' | 'mentions_replies' | 'reviews_account',
  value: boolean,
): Partial<NotificationPreferences> {
  if (kind === 'doji_live') return { doji_live: value, doji_start: value };
  if (kind === 'friend_requests') return { friend_requests: value, friend_request: value };
  if (kind === 'mentions_replies') {
    return { mentions_replies: value, mention: value, comment_reply: value };
  }
  return { reviews_account: value, suggestion: value };
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
