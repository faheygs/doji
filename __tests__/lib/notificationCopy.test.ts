import {
  notificationActorName,
  notificationActorInitials,
  followRequestCopy,
  followAcceptedCopy,
  newFollowerCopy,
  reactionActorsLine,
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

describe('follow notification copy', () => {
  const actor = { display_name: 'Alex Johnson', username: 'alexj' };

  it('formats follow request', () => {
    expect(followRequestCopy(actor)).toEqual({
      title: 'Alex Johnson',
      body: 'Wants to follow you',
    });
  });

  it('formats follow accepted', () => {
    expect(followAcceptedCopy(actor)).toEqual({
      title: 'Alex Johnson',
      body: 'Accepted your follow request',
    });
  });

  it('formats new follower', () => {
    expect(newFollowerCopy(actor)).toEqual({
      title: 'Alex Johnson',
      body: 'Started following you',
    });
  });
});

describe('reactionActorsLine', () => {
  it('single actor', () => {
    expect(
      reactionActorsLine([{ display_name: 'Alex', username: 'alex' }]),
    ).toEqual({ title: 'Alex', body: 'Reacted to your post' });
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
    expect(
      normalizeEmbeddedProfile([{ username: 'alex', display_name: 'Alex' }]),
    ).toEqual({ username: 'alex', display_name: 'Alex' });
  });
});
