import type { InfiniteData } from '@tanstack/react-query';
import type { Comment } from '../types/database';

export function patchCommentLike(
  comments: Comment[] | undefined,
  commentId: string,
  active: boolean,
  count?: number,
): Comment[] {
  return (comments ?? []).map((comment) =>
    comment.id === commentId
      ? {
          ...comment,
          my_like: active,
          like_count: count ?? Math.max(0, comment.like_count + (active ? 1 : -1)),
        }
      : comment,
  );
}

export function patchInfiniteCommentLike(
  data: InfiniteData<Comment[]> | undefined,
  commentId: string,
  active: boolean,
  count?: number,
): InfiniteData<Comment[]> | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => patchCommentLike(page, commentId, active, count)),
  };
}
