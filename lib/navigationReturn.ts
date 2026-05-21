import type { Href } from 'expo-router';

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
