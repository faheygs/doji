import type { Href } from 'expo-router';
import type { FeedPostDeepLinkOptions } from './notificationHref';
import { feedPostHref } from './notificationHref';

/** Canonical in-app routes — must match files under `app/`. */
export const ROUTES = {
  feed: '/(app)' as Href,
  welcome: '/(auth)/welcome' as Href,
  login: '/(auth)/login' as Href,
  username: '/(auth)/username' as Href,
  onboarding: '/(onboarding)' as Href,
  onboardingHowItWorks: '/(onboarding)/how-it-works' as Href,
  banned: '/banned' as Href,
  challenge: '/(app)/challenge' as Href,
  poll: '/(app)/poll' as Href,
  task: '/(app)/task' as Href,
  format: '/(app)/format' as Href,
  camera: '/(app)/camera' as Href,
  profile: '/(app)/profile' as Href,
  friends: '/(app)/friends' as Href,
} as const;

export function challengeEntryHref(type: string | null | undefined): Href {
  if (type === 'poll') return ROUTES.poll;
  if (type === 'task') return ROUTES.task;
  if (type === 'format') return ROUTES.format;
  return ROUTES.camera;
}

/** @deprecated Use ROUTES.feed — kept for existing imports. */
export const FEED_TAB_HREF = ROUTES.feed;

const FEED_ALIASES = new Set([
  '/',
  '/index',
  '/(app)',
  '/(app)/',
  '/(app)/index',
  '/(app)/index/',
]);

type RouterLike = {
  replace: (href: Href) => void;
  navigate?: (href: Href) => void;
  dismissAll?: () => void;
  canDismiss?: () => boolean;
};

/**
 * Map legacy / mistaken paths to real Expo Router hrefs.
 * `app/(app)/index.tsx` resolves to `/(app)`, never `/(app)/index`.
 */
export function normalizeHref(raw: string | Href | null | undefined): Href | null {
  if (raw == null) return null;
  const str = String(raw).trim();
  if (str.length === 0) return null;

  const pathOnly = str.split('?')[0]?.split('#')[0] ?? str;
  if (!pathOnly.startsWith('/') || pathOnly.startsWith('//')) return null;
  if (pathOnly.includes('..')) return null;

  if (FEED_ALIASES.has(pathOnly)) {
    return ROUTES.feed;
  }

  // Catch mistyped feed paths from older builds or deep links.
  if (/^\/\(app\)\/index\/?$/i.test(pathOnly)) {
    return ROUTES.feed;
  }

  return str as Href;
}

/** Safe replace — never navigates to an invalid href. */
export function safeReplace(router: RouterLike, href: string | Href): void {
  const normalized = normalizeHref(href);
  if (!normalized) {
    router.replace(ROUTES.feed);
    return;
  }
  try {
    router.replace(normalized);
  } catch {
    try {
      router.navigate?.(normalized);
    } catch {
      router.replace(ROUTES.feed);
    }
  }
}

/** Land on the home feed tab, optionally focusing a post / comments sheet. */
export function navigateToFeedPost(
  router: RouterLike,
  postId: string,
  options?: FeedPostDeepLinkOptions,
): void {
  safeReplace(router, feedPostHref(postId, options));
}

/** Land on the home feed tab after challenge flows, notifications, onboarding, etc. */
export function navigateToFeed(router: RouterLike): void {
  // dismissAll() fights with safeReplace — both fire, one pops to an intermediate
  // screen (challenge/camera) before the replace lands. Just replace directly.
  safeReplace(router, ROUTES.feed);
}

/** Pathname safe to store in ?returnTo= (never `/(app)/index`). */
export function pathnameForReturnTo(pathname: string): string {
  return String(normalizeHref(pathname) ?? pathname);
}
