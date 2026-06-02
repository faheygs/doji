import { notificationHrefFromData } from '../../lib/notificationHref';
import { FEED_TAB_HREF } from '../../lib/navigationReturn';

describe('notificationHrefFromData', () => {
  it('returns null for null data', () => {
    expect(notificationHrefFromData(null)).toBeNull();
  });

  it('returns null for undefined data', () => {
    expect(notificationHrefFromData(undefined)).toBeNull();
  });

  it('returns null for non-object data', () => {
    expect(notificationHrefFromData('string')).toBeNull();
    expect(notificationHrefFromData(42)).toBeNull();
  });

  it('returns null for empty object', () => {
    expect(notificationHrefFromData({})).toBeNull();
  });

  it('returns url for valid in-app path', () => {
    expect(notificationHrefFromData({ url: '/(app)/challenge' })).toBe('/(app)/challenge');
  });

  it('maps root url to feed tab href', () => {
    expect(notificationHrefFromData({ url: '/' })).toBe('/(app)');
  });

  it('rejects protocol-relative URLs (//host)', () => {
    expect(notificationHrefFromData({ url: '//evil.com/attack' })).toBeNull();
  });

  it('rejects absolute URLs', () => {
    expect(notificationHrefFromData({ url: 'https://evil.com' })).toBeNull();
  });

  it('returns challenge href for type CHALLENGE', () => {
    expect(notificationHrefFromData({ type: 'CHALLENGE' })).toBe('/(app)/challenge');
  });

  it('returns profile for BADGE', () => {
    expect(notificationHrefFromData({ type: 'BADGE' })).toBe('/(app)/profile');
  });

  it('returns profile for BADGE_EARNED', () => {
    expect(notificationHrefFromData({ type: 'BADGE_EARNED' })).toBe('/(app)/profile');
  });

  it('returns friends requests for FRIEND_REQUEST', () => {
    expect(notificationHrefFromData({ type: 'FRIEND_REQUEST' })).toBe('/(app)/friends/requests');
  });

  it('returns friends for FRIEND_ACCEPTED', () => {
    expect(notificationHrefFromData({ type: 'FRIEND_ACCEPTED' })).toBe('/(app)/friends');
  });

  it('returns feed with openComments for REACTION with postId', () => {
    expect(notificationHrefFromData({ type: 'REACTION', postId: 'abc-123' })).toBe(
      '/(app)?postId=abc-123',
    );
  });

  it('returns feed for FRIEND_POST with postId', () => {
    expect(notificationHrefFromData({ type: 'FRIEND_POST', postId: 'xyz' })).toBe(FEED_TAB_HREF);
  });

  it('returns feed for FRIEND_POST without postId', () => {
    expect(notificationHrefFromData({ type: 'FRIEND_POST' })).toBe(FEED_TAB_HREF);
  });

  it('returns feed with openComments for COMMENT with postId', () => {
    expect(notificationHrefFromData({ type: 'COMMENT', postId: 'abc' })).toBe(
      '/(app)?postId=abc&openComments=1',
    );
  });

  it('returns feed with openComments for MENTION with postId', () => {
    expect(notificationHrefFromData({ type: 'MENTION', postId: 'abc' })).toBe(
      '/(app)?postId=abc&openComments=1',
    );
  });

  it('returns profile for SUGGESTION_APPROVED', () => {
    expect(notificationHrefFromData({ type: 'SUGGESTION_APPROVED' })).toBe('/(app)/profile');
  });

  it('returns null for REACTION without postId', () => {
    expect(notificationHrefFromData({ type: 'REACTION' })).toBeNull();
  });

  it('prefers url over type', () => {
    expect(notificationHrefFromData({ url: '/(app)/post/123', type: 'CHALLENGE' })).toBe(
      '/(app)/post/123',
    );
  });

  it('falls back to type when url is invalid', () => {
    expect(notificationHrefFromData({ url: 'not-a-path', type: 'CHALLENGE' })).toBe(
      '/(app)/challenge',
    );
  });

  it('returns null for unknown type with no url', () => {
    expect(notificationHrefFromData({ type: 'UNKNOWN' })).toBeNull();
  });

  it('rejects numeric url', () => {
    expect(notificationHrefFromData({ url: 123 })).toBeNull();
  });
});
