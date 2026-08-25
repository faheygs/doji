/** Query families affected by one committed realtime event. */
export function realtimeQueryRoots(eventType: string): string[] {
  if (eventType === 'post.created' || eventType === 'feed.updated') {
    return ['feed'];
  }
  if (eventType.startsWith('feed.post.')) {
    return ['feed', 'post'];
  }
  if (eventType.startsWith('feed.reaction.')) {
    return ['feed', 'reactions', 'post'];
  }
  if (eventType.startsWith('feed.comment_like.')) {
    return ['comments'];
  }
  if (eventType.startsWith('feed.comment.')) {
    return ['feed', 'comments', 'post'];
  }
  if (eventType.startsWith('poll.vote_like.')) {
    return ['pollVoteLikes', 'pollVotersDetail'];
  }
  if (eventType.startsWith('poll.vote.')) {
    return ['pollResults', 'pollVotersDetail'];
  }
  return [];
}
