import { supabase } from './supabase';
import { runAbortableQuery } from './requestSignal';
import type {
  CommentPage,
  CommentPageRow,
  CommentScope,
  CommentPageRequest,
} from './commentWindow';

/** Validate server identity/cursors before admitting a page to an account window. */
export async function readCommentPage(
  scope: CommentScope,
  request: CommentPageRequest,
  signal: AbortSignal,
  limit = 50,
): Promise<CommentPage> {
  const readAt = Date.now();
  const { data } = await runAbortableQuery(
    supabase.rpc('get_comment_page_v2', {
      p_post_id: scope.postId,
      p_audience: scope.audience,
      p_parent_id: scope.parentId,
      p_cursor_created_at: request.cursor?.createdAt ?? null,
      p_cursor_id: request.cursor?.id ?? null,
      p_direction: request.direction,
      p_limit: limit,
    }),
    signal,
  );
  const page = data as CommentPage | null;
  const validCursor = (cursor: unknown) =>
    cursor === null ||
    (!!cursor &&
      typeof cursor === 'object' &&
      typeof (cursor as { id?: unknown }).id === 'string' &&
      typeof (cursor as { createdAt?: unknown }).createdAt === 'string');
  if (
    !page ||
    !Array.isArray(page.items) ||
    page.items.length > limit ||
    !validCursor(page.next) ||
    !validCursor(page.previous) ||
    page.items.some(
      (row) =>
        !row ||
        typeof row.id !== 'string' ||
        row.post_id !== scope.postId ||
        row.parent_id !== scope.parentId,
    )
  )
    throw new Error('Invalid comment page response');
  return { ...page, readAt };
}

export async function retainedCommentRows(
  scope: CommentScope,
  ids: string[],
  signal: AbortSignal,
): Promise<CommentPageRow[]> {
  const { data } = await runAbortableQuery(
    supabase.rpc('get_comment_rows_v2', {
      p_post_id: scope.postId,
      p_ids: ids,
      p_audience: scope.audience,
    }),
    signal,
  );
  if (
    !Array.isArray(data) ||
    data.length > 50 ||
    data.some((row) => !row || !ids.includes(row.id) || row.post_id !== scope.postId)
  )
    throw new Error('Invalid comment refresh response');
  return data as CommentPageRow[];
}
