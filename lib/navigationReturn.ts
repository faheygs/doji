import type { Href, Router } from 'expo-router';

/**
 * Home feed (Today's feed tab). Must match:
 * - File: `app/(app)/index.tsx`
 * - Tab: first `Tabs.Screen name="index"` in `app/(app)/_layout.tsx`
 */
export const FEED_TAB_HREF = '/(app)/index' as Href;

/**
 * Same screen as {@link FEED_TAB_HREF} — alternate linking form for Expo groups.
 * Avoid using this as an imperative navigation target after flows like challenge complete;
 * prefer {@link FEED_TAB_HREF} so the home tab is always selected.
 */
export const FEED_GROUP_HREF = '/(app)' as Href;

type RouterBackOrHome = {
  back: () => void;
  canGoBack: () => boolean;
  replace: (href: Href) => void;
};

/**
 * Pop the stack if possible; otherwise land on the home feed (e.g. user opened challenge
 * from a push and there is no “back” screen).
 */
export function backOrHome(router: RouterBackOrHome): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(FEED_TAB_HREF);
}

/**
 * After completing today's challenge from camera / poll / task: land on the home feed only.
 * Prefer **`replace`** so we always end on `/(app)/index` even when the app was cold-started
 * from a push (stack may be notification → challenge → poll, with no prior feed in history).
 * Do not fall back to `/(app)` — that group path does not reliably select the home tab.
 */
export function navigateToFeedAfterChallengeComplete(router: Router): void {
  try {
    router.replace(FEED_TAB_HREF);
  } catch {
    try {
      router.navigate(FEED_TAB_HREF);
    } catch {
      /* ignore */
    }
  }
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
  return `${path}${joiner}${RETURN_TO_QUERY}=${encodeURIComponent(returnToPath)}` as Href;
}

/**
 * Decode returnTo from search params. Accepts any absolute in-app path we set (from usePathname()).
 * Rejects obvious open redirects.
 */
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
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return null;
  if (decoded.includes('..')) return null;
  return decoded as Href;
}

/**
 * Prefer an explicit return path (same tab/screen the user came from). Otherwise stack back, then fallback.
 */
export function goBackWithOptionalReturn(router: RouterBack, returnToRaw: unknown, fallback: Href): void {
  const explicit = sanitizeReturnTo(returnToRaw);
  if (explicit) {
    router.replace(explicit);
    return;
  }
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
}
