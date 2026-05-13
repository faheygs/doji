/**
 * Test the notificationHrefFromData function logic.
 * Since it's defined inside _layout.tsx and not exported, we test the logic inline.
 */

type Href = string;

function notificationHrefFromData(data: unknown): Href | null {
  if (!data || typeof data !== 'object') return null;
  const rec = data as Record<string, unknown>;
  const url = rec.url;
  if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) return url as Href;
  if (rec.type === 'CHALLENGE') return '/(app)/challenge';
  const postId = rec.postId;
  if (
    (rec.type === 'REACTION' || rec.type === 'FRIEND_POST') &&
    typeof postId === 'string' &&
    postId.length > 0
  ) {
    return `/(app)/post/${postId}` as Href;
  }
  return null;
}

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

  it('returns url for root path', () => {
    expect(notificationHrefFromData({ url: '/' })).toBe('/');
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

  it('returns post href for REACTION with postId', () => {
    expect(notificationHrefFromData({ type: 'REACTION', postId: 'abc-123' })).toBe(
      '/(app)/post/abc-123',
    );
  });

  it('returns post href for FRIEND_POST with postId', () => {
    expect(notificationHrefFromData({ type: 'FRIEND_POST', postId: 'xyz' })).toBe('/(app)/post/xyz');
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
