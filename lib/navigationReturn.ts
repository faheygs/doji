import type { Href, ImperativeRouter } from 'expo-router';
import {
  ROUTES,
  navigateToFeed,
  normalizeHref,
  pathnameForReturnTo,
  safeReplace,
} from './routes';

export { ROUTES, navigateToFeed, normalizeHref, pathnameForReturnTo, safeReplace };

/** Canonical href for the home feed tab. */
export const FEED_TAB_HREF = ROUTES.feed;

/** Canonical href for the home feed tab group. */
export const FEED_GROUP_HREF = ROUTES.feed;

type RouterBackOrHome = {
  back: () => void;
  canGoBack: () => boolean;
  replace: (href: Href) => void;
};

export function backOrHome(router: RouterBackOrHome): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  safeReplace(router, FEED_TAB_HREF);
}

export function navigateToFeedAfterChallengeComplete(router: ImperativeRouter): void {
  // Leave challenge stacks/modals first so hidden tab screens cannot keep a full-screen Modal mounted.
  navigateToFeed(router);
}

export const RETURN_TO_QUERY = 'returnTo';

type RouterBack = {
  back: () => void;
  canGoBack: () => boolean;
  replace: (href: Href) => void;
};

/** Append ?returnTo= so the next screen can return to the exact route the user left from. */
export function hrefWithReturnTo(path: string, returnToPath: string): Href {
  const joiner = path.includes('?') ? '&' : '?';
  const safeReturn = pathnameForReturnTo(returnToPath);
  return `${path}${joiner}${RETURN_TO_QUERY}=${encodeURIComponent(safeReturn)}` as Href;
}

export function sanitizeReturnTo(raw: unknown): Href | null {
  if (raw == null) return null;
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== 'string' || v.length === 0) return null;
  const direct = normalizeHref(v);
  if (direct) return direct;
  let decoded: string;
  try {
    decoded = decodeURIComponent(v);
  } catch {
    return null;
  }
  return normalizeHref(decoded);
}

/** Rebuild a screen href while retaining the origin it must return to next. */
export function hrefPreservingReturnTo(path: string, returnToRaw: unknown): Href {
  const safePath = normalizeHref(path) ?? FEED_TAB_HREF;
  const explicit = sanitizeReturnTo(returnToRaw);
  return explicit ? hrefWithReturnTo(String(safePath), String(explicit)) : safePath;
}

export function goBackWithOptionalReturn(
  router: RouterBack,
  returnToRaw: unknown,
  fallback: Href,
): void {
  // Normal app navigation is a real Stack above the tab root. Pop it first so
  // Back always means the screen the user actually came from. `returnTo` only
  // exists as a cold/deep-link fallback when no in-memory history is present.
  if (router.canGoBack()) {
    router.back();
    return;
  }
  const explicit = sanitizeReturnTo(returnToRaw);
  if (explicit) {
    safeReplace(router, explicit);
    return;
  }
  safeReplace(router, normalizeHref(fallback) ?? FEED_TAB_HREF);
}

/**
 * Compatibility name retained for existing detail screens. The outer Stack is
 * authoritative; an explicit return route is only a no-history fallback.
 */
export function goBackToExplicitReturn(
  router: RouterBack,
  returnToRaw: unknown,
  fallback: Href,
): void {
  goBackWithOptionalReturn(router, returnToRaw, fallback);
}
