import type { Href } from 'expo-router';

export type PostDetailDeepLinkOptions = {
  openComments?: boolean;
  mentionCommentId?: string;
};

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

/** Build an exact post route without relying on feed pagination or audience. */
export function postDetailHref(postId: string, options?: PostDetailDeepLinkOptions): Href {
  const params = new URLSearchParams();
  if (options?.openComments) params.set('openComments', '1');
  if (options?.mentionCommentId) params.set('mentionCommentId', options.mentionCommentId);
  const query = params.toString();
  return `/(app)/post/${encodeURIComponent(postId)}${query ? `?${query}` : ''}` as Href;
}

export function challengeEntryHref(type: string | null | undefined): Href {
  if (type === 'poll') return ROUTES.poll;
  if (type === 'task') return ROUTES.task;
  if (type === 'format') return ROUTES.format;
  return ROUTES.camera;
}

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
 * Map previously-issued and mistaken paths to real Expo Router hrefs.
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

  // Catch feed paths issued by earlier builds or malformed deep links.
  if (/^\/\(app\)\/index\/?$/i.test(pathOnly)) {
    return ROUTES.feed;
  }

  return str as Href;
}

/** Safe replace — never navigates to an invalid href; reports whether routing was accepted. */
export function safeReplace(router: RouterLike, href: string | Href): boolean {
  const normalized = normalizeHref(href);
  if (!normalized) {
    try {
      router.replace(ROUTES.feed);
      return true;
    } catch {
      return false;
    }
  }
  try {
    router.replace(normalized);
    return true;
  } catch {
    try {
      if (router.navigate) {
        router.navigate(normalized);
        return true;
      }
    } catch {
      /* Fall through to the safe home destination. */
    }
    try {
      router.replace(ROUTES.feed);
      return true;
    } catch {
      return false;
    }
  }
}

/** Open an exact post, optionally opening its comments sheet. */
export function navigateToFeedPost(
  router: RouterLike,
  postId: string,
  options?: PostDetailDeepLinkOptions,
): void {
  safeReplace(router, postDetailHref(postId, options));
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
