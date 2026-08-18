import { realtimeQueryRoots } from '../../lib/realtimeQueryRoots';

describe('realtimeQueryRoots', () => {
  it('does not reload the feed or polls for a comment heart', () => {
    expect(realtimeQueryRoots('feed.comment_like.insert')).toEqual(['comments']);
  });

  it('targets only the surfaces changed by each public event', () => {
    expect(realtimeQueryRoots('feed.reaction.insert')).toEqual(['feed', 'reactions', 'post']);
    expect(realtimeQueryRoots('feed.comment.insert')).toEqual(['feed', 'comments', 'post']);
    expect(realtimeQueryRoots('poll.vote.updated')).toEqual([
      'pollResults',
      'pollVotersDetail',
      'feed',
    ]);
    expect(realtimeQueryRoots('poll.vote_like.insert')).toEqual([
      'pollVoteLikes',
      'pollVotersDetail',
    ]);
  });
});
