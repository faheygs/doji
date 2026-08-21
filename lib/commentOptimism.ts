import type { InfiniteData } from '@tanstack/react-query';
import type { Comment, Profile } from '../types/database';

export function createOptimisticComment(input: {
  postId: string;
  userId: string;
  body: string;
  parentId: string | null;
  replyToCommentId?: string | null;
  commandId: string;
  profile?: Profile | null;
  now?: string;
}): Comment {
  const now = input.now ?? new Date().toISOString();
  return {
    id: `optimistic:${input.commandId}`,
    post_id: input.postId,
    user_id: input.userId,
    parent_id: input.parentId,
    reply_to_comment_id: input.replyToCommentId ?? input.parentId,
    body: input.body,
    like_count: 0,
    created_at: now,
    updated_at: null,
    body_edited: false,
    idempotency_key: input.commandId,
    profile: input.profile ?? undefined,
    my_like: false,
  };
}

export function prependOptimisticComment(
  data: InfiniteData<Comment[]> | undefined,
  comment: Comment,
): InfiniteData<Comment[]> | undefined {
  if (!data) return data;
  const pages = data.pages.map((page) =>
    page.filter((item) => item.idempotency_key !== comment.idempotency_key),
  );
  pages[0] = [comment, ...(pages[0] ?? [])];
  return { ...data, pages };
}

export function replaceOptimisticComment(
  data: InfiniteData<Comment[]> | undefined,
  commandId: string,
  authoritative: Comment,
): InfiniteData<Comment[]> | undefined {
  if (!data) return data;
  let replaced = false;
  const pages = data.pages.map((page) => {
    const next: Comment[] = [];
    for (const item of page) {
      const sameCommand = item.idempotency_key === commandId;
      const sameRow = item.id === authoritative.id;
      if (sameCommand || sameRow) {
        if (!replaced) next.push(authoritative);
        replaced = true;
      } else {
        next.push(item);
      }
    }
    return next;
  });
  return { ...data, pages };
}
