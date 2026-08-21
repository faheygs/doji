import {
  commentLikeActorsLine,
  notificationActorName,
  notificationActorInitials,
  friendRequestCopy,
  friendAcceptedCopy,
  reactionActorsLine,
  commentActivityCopy,
  friendActivityActorsLine,
  challengeCopy,
  normalizeEmbeddedProfile,
} from '../../lib/notificationCopy';

describe('notificationActorName', () => {
  it('prefers display name', () => {
    expect(notificationActorName({ display_name: 'Alex Johnson', username: 'alexj' })).toBe(
      'Alex Johnson',
    );
  });

  it('falls back to @username', () => {
    expect(notificationActorName({ username: 'alexj' })).toBe('@alexj');
  });

  it('returns Someone when empty', () => {
    expect(notificationActorName(null)).toBe('Someone');
  });
});

describe('notificationActorInitials', () => {
  it('uses display name initials', () => {
    expect(notificationActorInitials({ display_name: 'Alex Johnson' })).toBe('AL');
  });

  it('uses username initials when no display name', () => {
    expect(notificationActorInitials({ username: 'zoeleee' })).toBe('ZO');
  });
});

describe('commentLikeActorsLine', () => {
  it('groups repeated likes on one comment into one readable activity', () => {
    expect(
      commentLikeActorsLine(
        [{ display_name: 'Kira' }, { display_name: 'Shannon' }, { display_name: 'Todd' }],
        3,
      ),
    ).toEqual({ title: 'Kira and 2 others', body: 'Liked your comment' });
  });
});

describe('friend notification copy', () => {
  const actor = { display_name: 'Alex Johnson', username: 'alexj' };

  it('formats friend request', () => {
    expect(friendRequestCopy(actor)).toEqual({
      title: 'Alex Johnson',
      body: 'Sent you a friend request',
    });
  });

  it('formats friend accepted', () => {
    expect(friendAcceptedCopy(actor)).toEqual({
      title: 'Alex Johnson',
      body: 'Accepted your friend request',
    });
  });
});

describe('reactionActorsLine', () => {
  it('single actor', () => {
    expect(reactionActorsLine([{ display_name: 'Alex', username: 'alex' }])).toEqual({
      title: 'Alex',
      body: 'Reacted to your post',
    });
  });

  it('multiple actors', () => {
    expect(
      reactionActorsLine([
        { display_name: 'Alex', username: 'alex' },
        { display_name: 'Zoe', username: 'zoe' },
        { display_name: 'Ben', username: 'ben' },
      ]),
    ).toEqual({ title: 'Alex and 2 others', body: 'Reacted to your post' });
  });

  it('labels shared Doji reactions without claiming post ownership', () => {
    expect(reactionActorsLine([{ display_name: 'Alex' }], true)).toEqual({
      title: 'Alex',
      body: "Reacted to today's Doji",
    });
  });
});

describe('commentActivityCopy', () => {
  it('uses owned-post copy only for individual posts', () => {
    expect(commentActivityCopy({ display_name: 'Heather' }, false)).toEqual({
      title: 'Heather',
      body: 'Commented on your post',
    });
  });

  it('uses shared Doji copy for community posts', () => {
    expect(commentActivityCopy({ display_name: 'Heather' }, true)).toEqual({
      title: 'Heather',
      body: "Commented on today's Doji",
    });
  });
});

describe('friendActivityActorsLine', () => {
  it('uses the exact grouped count even when actor previews are bounded', () => {
    expect(friendActivityActorsLine([{ display_name: 'Kira', username: 'kira' }], 20)).toEqual({
      title: 'Kira and 19 other friends',
      body: "Completed today's Doji",
    });
  });
});

describe('challengeCopy', () => {
  it('uses challenge title in body', () => {
    expect(challengeCopy('Snap your view')).toEqual({
      title: "Today's Doji is live",
      body: 'Snap your view',
    });
  });
});

describe('normalizeEmbeddedProfile', () => {
  it('unwraps single-element arrays from Supabase embeds', () => {
    expect(normalizeEmbeddedProfile([{ username: 'alex', display_name: 'Alex' }])).toEqual({
      username: 'alex',
      display_name: 'Alex',
    });
  });
});
