import {
  ROUTES,
  normalizeHref,
  pathnameForReturnTo,
  navigateToFeed,
} from '../../lib/routes';

describe('routes', () => {
  it('uses one canonical feed route', () => {
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
    expect(normalizeHref('/(onboarding)/profile-setup')).toBe('/(onboarding)/profile-setup');
  });

  it('normalizeHref rejects bad paths', () => {
    expect(normalizeHref('//evil.com')).toBeNull();
    expect(normalizeHref('../etc')).toBeNull();
  });

  it('pathnameForReturnTo never stores /(app)/index', () => {
    expect(pathnameForReturnTo('/(app)/index')).toBe('/(app)');
  });
});

// ---------------------------------------------------------------------------
// navigateToFeed — regression for the back-to-feed loop bug
// dismissAll() was racing with safeReplace and landing on intermediate
// screens (challenge/camera). It must never be called.
// ---------------------------------------------------------------------------
describe('navigateToFeed', () => {
  function makeRouter(overrides: Record<string, unknown> = {}) {
    return {
      replace: jest.fn(),
      navigate: jest.fn(),
      canDismiss: jest.fn().mockReturnValue(true),
      dismissAll: jest.fn(),
      dismissTo: undefined,
      ...overrides,
    };
  }

  it('always replaces with the feed route', () => {
    const router = makeRouter();
    navigateToFeed(router);
    expect(router.replace).toHaveBeenCalledWith(ROUTES.feed);
  });

  it('never calls dismissAll regardless of canDismiss', () => {
    const router = makeRouter({ canDismiss: jest.fn().mockReturnValue(true) });
    navigateToFeed(router);
    expect(router.dismissAll).not.toHaveBeenCalled();
  });

  it('never calls dismissAll when canDismiss returns false', () => {
    const router = makeRouter({ canDismiss: jest.fn().mockReturnValue(false) });
    navigateToFeed(router);
    expect(router.dismissAll).not.toHaveBeenCalled();
  });

  it('replaces to feed even when router has no optional methods', () => {
    const router = { replace: jest.fn() };
    navigateToFeed(router);
    expect(router.replace).toHaveBeenCalledWith(ROUTES.feed);
  });

  it('calls replace exactly once — no double navigation', () => {
    const router = makeRouter();
    navigateToFeed(router);
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(ROUTES.feed);
  });
});
