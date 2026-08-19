import {
  hrefWithReturnTo,
  sanitizeReturnTo,
  goBackWithOptionalReturn,
  goBackToExplicitReturn,
  RETURN_TO_QUERY,
} from '../../lib/navigationReturn';
import { ROUTES } from '../../lib/routes';
import type { Href } from 'expo-router';

// ---------------------------------------------------------------------------
// hrefWithReturnTo
// ---------------------------------------------------------------------------
describe('hrefWithReturnTo', () => {
  it('appends returnTo query param', () => {
    const href = hrefWithReturnTo('/(app)/member/alice', '/(app)');
    expect(href).toContain(RETURN_TO_QUERY);
    expect(href).toContain(encodeURIComponent('/(app)'));
  });

  it('uses & joiner when path already has query params', () => {
    const href = hrefWithReturnTo('/(app)/member/alice?tab=posts', '/(app)');
    expect(href).toContain('?tab=posts&returnTo=');
  });

  it('uses ? joiner when path has no query params', () => {
    const href = hrefWithReturnTo('/(app)/member/alice', '/(app)');
    expect(String(href)).toContain('?returnTo=');
  });
});

// ---------------------------------------------------------------------------
// sanitizeReturnTo
// ---------------------------------------------------------------------------
describe('sanitizeReturnTo', () => {
  it('returns null for null', () => {
    expect(sanitizeReturnTo(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(sanitizeReturnTo(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(sanitizeReturnTo('')).toBeNull();
  });

  it('returns null for non-string', () => {
    expect(sanitizeReturnTo(123)).toBeNull();
  });

  it('decodes a valid encoded href', () => {
    const encoded = encodeURIComponent('/(app)/profile');
    const result = sanitizeReturnTo(encoded);
    expect(result).toBe('/(app)/profile');
  });

  it('accepts a plain href without encoding', () => {
    const result = sanitizeReturnTo('/(app)/profile');
    expect(result).toBe('/(app)/profile');
  });

  it('uses first element when given an array', () => {
    const result = sanitizeReturnTo(['/(app)/profile', '/(app)/other']);
    expect(result).toBe('/(app)/profile');
  });

  it('returns null for relative path (no leading slash)', () => {
    expect(sanitizeReturnTo('profile')).toBeNull();
  });

  it('returns null for path with ..', () => {
    expect(sanitizeReturnTo('/../secret')).toBeNull();
  });

  it('returns null for double-slash path', () => {
    expect(sanitizeReturnTo('//evil.com')).toBeNull();
  });

  it('normalises /(app)/index to feed href', () => {
    const result = sanitizeReturnTo('/(app)/index');
    expect(result).toBe(ROUTES.feed);
  });
});

// ---------------------------------------------------------------------------
// goBackWithOptionalReturn
// ---------------------------------------------------------------------------
describe('goBackWithOptionalReturn', () => {
  it('calls router.back() when canGoBack is true', () => {
    const router = {
      back: jest.fn(),
      canGoBack: jest.fn().mockReturnValue(true),
      replace: jest.fn(),
    };
    goBackWithOptionalReturn(router, null, ROUTES.feed);
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('pops real history instead of duplicating an explicit returnTo route', () => {
    const router = {
      back: jest.fn(),
      canGoBack: jest.fn().mockReturnValue(true),
      replace: jest.fn(),
    };
    goBackWithOptionalReturn(router, encodeURIComponent('/(app)/friends'), ROUTES.feed);
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('uses explicit returnTo when no stack history exists', () => {
    const router = {
      back: jest.fn(),
      canGoBack: jest.fn().mockReturnValue(false),
      replace: jest.fn(),
    };
    goBackWithOptionalReturn(router, encodeURIComponent('/(app)/friends'), ROUTES.feed);
    expect(router.replace).toHaveBeenCalledWith('/(app)/friends');
    expect(router.back).not.toHaveBeenCalled();
  });

  it('uses fallback when canGoBack is false and returnTo is null', () => {
    const router = {
      back: jest.fn(),
      canGoBack: jest.fn().mockReturnValue(false),
      replace: jest.fn(),
    };
    goBackWithOptionalReturn(router, null, ROUTES.profile as Href);
    expect(router.replace).toHaveBeenCalledWith(ROUTES.profile);
  });

  it('uses feed when canGoBack is false, returnTo is invalid, and fallback is invalid', () => {
    const router = {
      back: jest.fn(),
      canGoBack: jest.fn().mockReturnValue(false),
      replace: jest.fn(),
    };
    goBackWithOptionalReturn(router, 'bad-href', '' as Href);
    expect(router.replace).toHaveBeenCalledWith(ROUTES.feed);
  });
});

describe('goBackToExplicitReturn', () => {
  it('uses the explicit origin before incidental tab history', () => {
    const router = {
      back: jest.fn(),
      canGoBack: jest.fn().mockReturnValue(true),
      replace: jest.fn(),
    };
    goBackToExplicitReturn(
      router,
      encodeURIComponent('/(app)/profile/settings'),
      ROUTES.feed,
    );
    expect(router.replace).toHaveBeenCalledWith('/(app)/profile/settings');
    expect(router.back).not.toHaveBeenCalled();
  });

  it('pops history when no explicit origin exists', () => {
    const router = {
      back: jest.fn(),
      canGoBack: jest.fn().mockReturnValue(true),
      replace: jest.fn(),
    };
    goBackToExplicitReturn(router, null, ROUTES.feed);
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });
});
