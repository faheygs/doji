import { useCallback, type ReactNode } from 'react';
import { View } from 'react-native';
import { CommentWindowPage } from './CommentWindowPage';
import type { CommentPageRow } from '../../lib/commentWindow';
import type { FeedAudience } from '../../lib/feedAudience';

export function CommentWindowList({
  postId,
  audience,
  enabled,
  parent,
  renderComment,
  onThreadChange,
  onAvailability,
}: {
  postId: string;
  audience: FeedAudience;
  enabled: boolean;
  parent: CommentPageRow | null;
  renderComment: (row: CommentPageRow, reply: boolean) => ReactNode;
  onThreadChange: (row: CommentPageRow | null) => void;
  onAvailability: (available: boolean) => void;
}) {
  const open = useCallback((row: CommentPageRow) => onThreadChange(row), [onThreadChange]);
  const close = useCallback(() => onThreadChange(null), [onThreadChange]);
  return (
    <View style={{ flex: 1 }}>
      <CommentWindowPage
        scope={{ postId, audience, parentId: null }}
        enabled={enabled && !parent}
        renderComment={renderComment}
        onOpenReplies={open}
        onAvailability={onAvailability}
      />
      {parent ? (
        <CommentWindowPage
          key={parent.id}
          scope={{ postId, audience, parentId: parent.id }}
          enabled={enabled}
          renderComment={renderComment}
          onOpenReplies={open}
          onBack={close}
          onAvailability={onAvailability}
        />
      ) : null}
    </View>
  );
}
