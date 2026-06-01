import type { Post } from '../types/database';

export type FeedAudience = 'friends' | 'everyone';

/** Client-side safety net: friends feed = community poll (when included) + posts from people you follow (+ self). */
export function filterPostsForAudience(
  posts: Post[],
  audience: FeedAudience,
  followingIds: string[],
): Post[] {
  if (audience === 'everyone') return posts;
  const allowed = new Set(followingIds);
  return posts.filter(
    (post) => post.is_community_poll || (post.user_id != null && allowed.has(post.user_id)),
  );
}
