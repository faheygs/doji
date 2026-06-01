import type { Href } from 'expo-router';
import { FEED_TAB_HREF, normalizeHref } from './routes';

/** Resolve push / in-app notification payload to an in-app route. */
export function notificationHrefFromData(data: unknown): Href | null {
  if (!data || typeof data !== 'object') return null;
  const rec = data as Record<string, unknown>;
  const url = rec.url;
  if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) {
    return normalizeHref(url) ?? FEED_TAB_HREF;
  }

  const type = rec.type;
  const postId = rec.postId;

  if (type === 'CHALLENGE') return '/(app)/challenge';
  if (type === 'BADGE' || type === 'BADGE_EARNED') return '/(app)/profile' as Href;
  if (type === 'FRIEND_REQUEST' || type === 'FOLLOW_REQUEST') {
    return '/(app)/friends/requests';
  }
  if (type === 'FRIEND_ACCEPTED' || type === 'FOLLOW_ACCEPTED') {
    return '/(app)/friends';
  }
  if (type === 'FRIEND_POST') return FEED_TAB_HREF;
  if (type === 'SUGGESTION_APPROVED' || type === 'SUGGESTION_REJECTED') {
    return '/(app)/profile' as Href;
  }
  if (
    (type === 'REACTION' ||
      type === 'COMMENT' ||
      type === 'MENTION') &&
    typeof postId === 'string' &&
    postId.length > 0
  ) {
    return `/(app)/post/${postId}` as Href;
  }

  return null;
}
