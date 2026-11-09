import type { Post } from '../types/database';

/** Small forward window, independent of post-channel/social-list subscriptions. */
export function feedMediaWindow(posts: readonly Post[], visible: ReadonlySet<string>): Set<string> {
  const ids = new Set<string>();
  let end = -1;
  posts.forEach((post, index) => {
    if (visible.has(post.id)) {
      ids.add(post.id);
      end = index;
    }
  });
  // Prime two cards before the native list reports its first visible range.
  for (const post of posts.slice(end + 1, end + 3)) ids.add(post.id);
  return ids;
}
