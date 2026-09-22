import type { Href } from 'expo-router';
import { normalizeHref, postDetailHref, ROUTES } from './routes';

/** Resolve a push payload to a page that will be pushed above the tab root. */
export function notificationHrefFromData(data: unknown): Href | null {
  if (!data || typeof data !== 'object') return null;
  const rec = data as Record<string, unknown>;
  const type = rec.type;
  // Accept both the current camelCase producer contract and legacy/database-shaped
  // payloads so an older queued notification still lands on the correct content.
  const postId = rec.postId ?? rec.post_id;
  const commentId = rec.commentId ?? rec.comment_id;

  if (type === 'CHALLENGE') return '/(app)/challenge';
  if (type === 'BADGE' || type === 'BADGE_EARNED') return '/(app)/profile' as Href;
  if (type === 'FRIEND_REQUEST') {
    return '/(app)/friends/requests';
  }
  if (type === 'FRIEND_ACCEPTED') {
    return '/(app)/friends';
  }
  if (type === 'FRIEND_POST') {
    return typeof postId === 'string' && postId.length > 0
      ? postDetailHref(postId)
      : ROUTES.feed;
  }
  if (type === 'POLL_VOTE') return ROUTES.feed;
  if (type === 'SUGGESTION_APPROVED' || type === 'SUGGESTION_REJECTED') {
    return '/(app)/profile' as Href;
  }
  if (
    (type === 'REACTION' ||
      type === 'COMMENT' ||
      type === 'COMMENT_LIKE' ||
      type === 'MENTION' ||
      type === 'COMMENT_REPLY') &&
    typeof postId === 'string' &&
    postId.length > 0
  ) {
    return postDetailHref(postId, {
      openComments:
        type === 'COMMENT' ||
        type === 'COMMENT_LIKE' ||
        type === 'MENTION' ||
        type === 'COMMENT_REPLY',
      mentionCommentId: typeof commentId === 'string' ? commentId : undefined,
    });
  }

  // Older notification producers used `/post/:id`, which is not a real Expo
  // route. Resolve known notification types from identifiers first, then allow
  // a validated URL only for forward-compatible/unknown payloads.
  const url = rec.url;
  if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) {
    return normalizeHref(url) ?? ROUTES.feed;
  }

  return null;
}
