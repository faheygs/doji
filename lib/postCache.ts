import type { InfiniteData } from '@tanstack/react-query';
import type { Post } from '../types/database';

export function mapInfinitePosts(
  old: InfiniteData<Post[]> | undefined,
  postId: string,
  patch: (post: Post) => Post,
): InfiniteData<Post[]> | undefined {
  if (!old) return old;
  return {
    ...old,
    pages: old.pages.map((page) =>
      page.map((post) => (post.id === postId ? patch(post) : post)),
    ),
  };
}
