import type { Post } from '../types/database';

export type StableFeedResult = {
  posts: Post[];
  withheldIds: string[];
};

/**
 * Preserve the current viewport when realtime inserts rows above it.
 *
 * Rows removed by the authoritative response are removed immediately (block,
 * moderation, deletion). Rows appended by pagination remain visible. Only rows
 * newly inserted ahead of the previous head are withheld.
 */
export function stabilizeFeedPosts(
  latest: Post[],
  previousVisibleIds: readonly string[],
  scrolledAwayFromTop: boolean,
): StableFeedResult {
  if (!scrolledAwayFromTop || previousVisibleIds.length === 0 || latest.length === 0) {
    return { posts: latest, withheldIds: [] };
  }

  const previousVisible = new Set(previousVisibleIds);
  const previousHeadIndex = latest.findIndex((post) => previousVisible.has(post.id));
  if (previousHeadIndex <= 0) return { posts: latest, withheldIds: [] };

  const withheldIds = latest
    .slice(0, previousHeadIndex)
    .filter((post) => !previousVisible.has(post.id))
    .map((post) => post.id);
  const withheld = new Set(withheldIds);
  return {
    posts: latest.filter((post) => !withheld.has(post.id)),
    withheldIds,
  };
}
