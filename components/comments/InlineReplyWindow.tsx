import { useEffect } from 'react';
import { useCommentWindow } from '../../hooks/useCommentWindow';
import { useInlineWindowPaging, type WindowController } from '../../hooks/useInlineWindowPaging';
import { INLINE_REPLY_BUDGET } from '../../lib/inlineCommentPaging';
import type { FeedAudience } from '../../lib/feedAudience';
import type { CommentReadIntent } from '../../lib/commentWindowReads';

export type ReplyController = Pick<
  WindowController,
  'data' | 'isError' | 'error' | 'isFetching' | 'isLoading'
> & {
  retry: () => void;
};
export function InlineReplyWindow({
  postId,
  audience,
  parentId,
  enabled,
  visible,
  onChange,
}: {
  postId: string;
  audience: FeedAudience;
  parentId: string;
  enabled: boolean;
  visible: ReadonlySet<string>;
  onChange: (parentId: string, state: ReplyController | undefined) => void;
}) {
  const query = useCommentWindow({ postId, audience, parentId }, enabled, INLINE_REPLY_BUDGET);
  const load = useInlineWindowPaging(query, enabled, visible);
  const { data, error, isError, isFetching, isLoading, lastIntent } = query;
  useEffect(() => {
    onChange(parentId, {
      data,
      error,
      isError,
      isFetching,
      isLoading,
      retry: () => load((data ? lastIntent : 'refresh') as CommentReadIntent, true),
    });
  }, [data, error, isError, isFetching, isLoading, lastIntent, load, onChange, parentId]);
  useEffect(() => () => onChange(parentId, undefined), [onChange, parentId]);
  return null;
}
