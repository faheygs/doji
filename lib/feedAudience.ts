import type { Comment, Post } from '../types/database';

export type FeedAudience = 'friends' | 'everyone';

/** Friends feed = comments authored by mutual friends (includes self). */
export function filterCommentsForAudience<T extends Pick<Comment, 'user_id'>>(
  comments: T[],
  audience: FeedAudience,
  friendIds: string[],
): T[] {
  if (audience === 'everyone') return comments;
  const allowed = new Set(friendIds);
  return comments.filter((c) => c.user_id != null && allowed.has(c.user_id));
}

/** Client-side safety net: friends feed = community poll (when included) + posts from mutual friends (+ self). */
export function filterPostsForAudience(
  posts: Post[],
  audience: FeedAudience,
  friendIds: string[],
): Post[] {
  if (audience === 'everyone') return posts;
  const allowed = new Set(friendIds);
  return posts.filter(
    (post) => post.is_community_poll || (post.user_id != null && allowed.has(post.user_id)),
  );
}
