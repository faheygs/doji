import {
  challengeEntryHref,
  normalizeHref,
  safePush,
  safeReplace,
  pathnameForReturnTo,
  postDetailHref,
} from '../../lib/routes';
import {
  notificationActorHandle,
  notificationActorInitials,
  notificationActorName,
  formatNotificationTime,
  reactionActorsLine,
  commentLikeActorsLine,
  friendActivityActorsLine,
  challengeCopy,
  normalizeEmbeddedProfile,
} from '../../lib/notificationCopy';

test.each([null, undefined, '', ' ', 'https://example.test', '//example.test', '/member/../admin'])(
  'unsafe/empty route %p is rejected',
  (value) => expect(normalizeHref(value)).toBeNull(),
);
test('legacy case-insensitive feed route normalizes, ordinary queries/fragments are preserved', () => {
  expect(normalizeHref('/(app)/INDEX/?a=1')).toBe('/(app)');
  expect(normalizeHref(' /member/person?mode=1#top ')).toBe('/member/person?mode=1#top');
  expect(pathnameForReturnTo('invalid')).toBe('invalid');
  expect(postDetailHref('a/b', {})).toBe('/(app)/post/a%2Fb');
});
test.each([
  ['poll', '/(app)/poll'],
  ['task', '/(app)/task'],
  ['format', '/(app)/format'],
  ['photo', '/(app)/camera'],
  [null, '/(app)/camera'],
  [undefined, '/(app)/camera'],
])('challenge %p uses its canonical entry', (type, expected) =>
  expect(challengeEntryHref(type)).toBe(expected),
);
test('safe push declines an invalid route without issuing any navigation', () => {
  const router = { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() };
  expect(safePush(router, '//external')).toBe(false);
  for (const fn of Object.values(router)) expect(fn).not.toHaveBeenCalled();
});
test('push exception falls back to navigate once and does not replace', () => {
  const router = {
    push: jest.fn(() => {
      throw Error('unavailable');
    }),
    navigate: jest.fn(),
    replace: jest.fn(),
  };
  expect(safePush(router, '/member/person')).toBe(true);
  expect(router.navigate).toHaveBeenCalledWith('/member/person');
  expect(router.replace).not.toHaveBeenCalled();
});
test('push and navigate exceptions fall back to replacement', () => {
  const fail = () => {
    throw Error('unavailable');
  };
  const router = { push: jest.fn(fail), navigate: jest.fn(fail), replace: jest.fn() };
  expect(safePush(router, '/member/person')).toBe(true);
  expect(router.replace).toHaveBeenCalledWith('/member/person');
});
test('legacy router without push or navigate replaces directly', () => {
  const router = { replace: jest.fn() };
  expect(safePush(router, '/member/person')).toBe(true);
  expect(router.replace).toHaveBeenCalledTimes(1);
});
test.each([true, false])(
  'invalid replacement uses safe home and reports acceptance=%s',
  (accepts) => {
    const replace = jest.fn(() => {
      if (!accepts) throw Error('not ready');
    });
    expect(safeReplace({ replace }, 'invalid')).toBe(accepts);
    expect(replace).toHaveBeenCalledWith('/(app)');
  },
);
test('failed replacement can use navigate, or safe home when navigate is absent', () => {
  const first = {
    replace: jest.fn(() => {
      throw Error('replace unavailable');
    }),
    navigate: jest.fn(),
  };
  expect(safeReplace(first, '/member/person')).toBe(true);
  expect(first.navigate).toHaveBeenCalledWith('/member/person');
  const second = {
    replace: jest.fn().mockImplementationOnce(() => {
      throw Error('unknown route');
    }),
  };
  expect(safeReplace(second, '/member/person')).toBe(true);
  expect(second.replace.mock.calls).toEqual([['/member/person'], ['/(app)']]);
});
test.each([null, undefined, {}, { display_name: ' ', username: ' ' }])(
  'missing actor %p renders safe anonymous copy',
  (actor) => {
    expect(notificationActorName(actor)).toBe('Someone');
    expect(notificationActorInitials(actor)).toBe('?');
    expect(notificationActorHandle(actor)).toBeUndefined();
  },
);
test('actor handles trim whitespace; display-name initials retain priority', () => {
  const actor = { username: ' user ', display_name: ' Name ' };
  expect(notificationActorHandle(actor)).toBe('user');
  expect(notificationActorName(actor)).toBe('Name');
  expect(notificationActorInitials(actor)).toBe('NA');
});
test.each([0, 1, 2, 3])(
  'grouped comment and completion counts %i use correct singular/plural',
  (count) => {
    const suffix = count <= 1 ? '' : count === 2 ? ' and 1 other' : ' and 2 others';
    expect(commentLikeActorsLine([{ username: 'user' }], count)).toEqual({
      title: `@user${suffix}`,
      body: 'Liked your comment',
    });
    expect(friendActivityActorsLine([{ username: 'user' }], count)).toEqual({
      title:
        count <= 1
          ? '@user'
          : count === 2
            ? '@user and 1 other friend'
            : '@user and 2 other friends',
      body: "Completed today's Doji",
    });
  },
);
test('reaction copy handles missing preview and exactly two actors without inventing ownership', () => {
  expect(reactionActorsLine([])).toEqual({ title: 'Someone', body: 'Reacted to your post' });
  expect(reactionActorsLine([{ username: 'first' }, { username: 'second' }], true)).toEqual({
    title: '@first and 1 other',
    body: "Reacted to today's Doji",
  });
});
test.each([null, undefined, '', ' '])(
  'missing challenge title %p uses generic Doji copy',
  (title) => expect(challengeCopy(title).body).toBe("Today's Doji"),
);
test('embed normalization handles absent, empty-array and object forms without copies', () => {
  const profile = { username: 'user' };
  expect(normalizeEmbeddedProfile(null)).toBeNull();
  expect(normalizeEmbeddedProfile(undefined)).toBeNull();
  expect(normalizeEmbeddedProfile([])).toBeNull();
  expect(normalizeEmbeddedProfile(profile)).toBe(profile);
  expect(formatNotificationTime('2026-10-01T12:00:00Z')).toBe('2026-10-01T12:00:00Z');
});
