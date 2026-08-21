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
  let decoded = v;
  try {
    decoded = decodeURIComponent(v);
  } catch {
    return null;
  }
  return normalizeHref(decoded);
}

export function goBackWithOptionalReturn(
  router: RouterBack,
  returnToRaw: unknown,
  fallback: Href,
): void {
  // A screen reached with router.push already has its real parent underneath it.
  // Pop that entry instead of replacing it with returnTo, which duplicates the
  // parent route (for example Profile -> Settings -> Edit -> Settings).
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
 * Hidden top-level tab routes have tab history that is not the user's screen
 * history. When one was opened with an explicit origin, return there before
 * considering Expo's incidental tab stack.
 */
export function goBackToExplicitReturn(
  router: RouterBack,
  returnToRaw: unknown,
  fallback: Href,
): void {
  const explicit = sanitizeReturnTo(returnToRaw);
  if (explicit) {
    safeReplace(router, explicit);
    return;
  }
  if (router.canGoBack()) {
    router.back();
    return;
  }
  safeReplace(router, normalizeHref(fallback) ?? FEED_TAB_HREF);
}
