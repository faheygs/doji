import {
  createOptimisticComment,
  prependOptimisticComment,
  replaceOptimisticComment,
} from '../../lib/commentOptimism';

describe('comment optimism', () => {
  const optimistic = createOptimisticComment({
    postId: 'post-1',
    userId: 'user-1',
    body: 'Right away',
    parentId: null,
    commandId: 'comment-command-123456',
    now: '2026-08-18T10:00:00Z',
  });

  it('puts the actor comment in the first page immediately', () => {
    const data = { pages: [[]], pageParams: [null] };
    expect(prependOptimisticComment(data, optimistic)?.pages[0][0]).toEqual(optimistic);
  });

  it('keeps an exact reply target while flattening under the root comment', () => {
    const reply = createOptimisticComment({
      postId: 'post-1',
      userId: 'user-1',
      body: '@kira Absolutely',
      parentId: 'root-comment',
      replyToCommentId: 'child-comment',
      commandId: 'reply-command-123456',
    });
    expect(reply.parent_id).toBe('root-comment');
    expect(reply.reply_to_comment_id).toBe('child-comment');
  });

  it('reconciles the optimistic row without duplicating a socket-refetched row', () => {
    const authoritative = { ...optimistic, id: 'server-comment-1' };
    const data = { pages: [[authoritative, optimistic]], pageParams: [null] };
    const result = replaceOptimisticComment(data, 'comment-command-123456', authoritative);
    expect(result?.pages[0]).toHaveLength(1);
    expect(result?.pages[0][0].id).toBe('server-comment-1');
  });
});
