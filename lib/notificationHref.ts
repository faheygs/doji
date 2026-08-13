import type { Href } from 'expo-router';
import { FEED_TAB_HREF, normalizeHref } from './routes';

export type FeedPostDeepLinkOptions = {
  openComments?: boolean;
  mentionCommentId?: string;
};

/** Build feed href that opens a post (and optionally comments) on the home tab. */
export function feedPostHref(postId: string, options?: FeedPostDeepLinkOptions): Href {
  const params = new URLSearchParams({ postId });
  if (options?.openComments) params.set('openComments', '1');
  if (options?.mentionCommentId) params.set('mentionCommentId', options.mentionCommentId);
  return `${FEED_TAB_HREF}?${params.toString()}` as Href;
}

/** Resolve push / in-app notification payload to an in-app route. */
export function notificationHrefFromData(data: unknown): Href | null {
  if (!data || typeof data !== 'object') return null;
  const rec = data as Record<string, unknown>;
  const type = rec.type;
  const postId = rec.postId;
  const commentId = rec.commentId;

  if (type === 'CHALLENGE') return '/(app)/challenge';
  if (type === 'BADGE' || type === 'BADGE_EARNED') return '/(app)/profile' as Href;
  if (type === 'FRIEND_REQUEST') {
    return '/(app)/friends/requests';
  }
  if (type === 'FRIEND_ACCEPTED') {
    return '/(app)/friends';
  }
  if (type === 'FRIEND_POST') return FEED_TAB_HREF;
  if (type === 'POLL_VOTE') return FEED_TAB_HREF;
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
    return feedPostHref(postId, {
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
    return normalizeHref(url) ?? FEED_TAB_HREF;
  }

  return null;
}
