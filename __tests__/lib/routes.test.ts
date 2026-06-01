import {
  FEED_TAB_HREF,
  ROUTES,
  normalizeHref,
  pathnameForReturnTo,
} from '../../lib/routes';

describe('routes', () => {
  it('FEED_TAB_HREF is the canonical feed route', () => {
    expect(FEED_TAB_HREF).toBe('/(app)');
    expect(ROUTES.feed).toBe('/(app)');
  });

  it('normalizeHref maps invalid feed paths to /(app)', () => {
    expect(normalizeHref('/(app)/index')).toBe('/(app)');
    expect(normalizeHref('/')).toBe('/(app)');
    expect(normalizeHref('/index')).toBe('/(app)');
    expect(normalizeHref('/(app)')).toBe('/(app)');
  });

  it('normalizeHref preserves valid routes', () => {
    expect(normalizeHref('/(app)/challenge')).toBe('/(app)/challenge');
    expect(normalizeHref('/(app)/post/abc')).toBe('/(app)/post/abc');
    expect(normalizeHref('/(onboarding)/privacy')).toBe('/(onboarding)/privacy');
  });

  it('normalizeHref rejects bad paths', () => {
    expect(normalizeHref('//evil.com')).toBeNull();
    expect(normalizeHref('../etc')).toBeNull();
  });

  it('pathnameForReturnTo never stores /(app)/index', () => {
    expect(pathnameForReturnTo('/(app)/index')).toBe('/(app)');
  });
});
