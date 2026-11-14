/** Query families affected by one committed realtime event. */
export function realtimeQueryRoots(eventType: string): string[] {
  if (eventType === 'post.created' || eventType === 'feed.updated') {
    return ['feed', 'profilePost', 'firstDoji'];
  }
  if (eventType.startsWith('feed.post.')) {
    return ['feed', 'post', 'profilePost', 'firstDoji'];
  }
  if (eventType.startsWith('feed.reaction.')) {
    return ['feed', 'reactions', 'post'];
  }
  if (eventType.startsWith('feed.comment_like.')) {
    return ['comments', 'commentWindow', 'commentLikes'];
  }
  if (eventType.startsWith('feed.comment.')) {
    return ['feed', 'comments', 'commentWindow', 'post'];
  }
  if (eventType.startsWith('poll.vote_like.')) {
    return ['pollVoteLikes', 'pollVotersDetail'];
  }
  if (eventType.startsWith('poll.vote.')) {
    return ['pollResults', 'pollVotersDetail', 'firstDoji'];
  }
  return [];
}
