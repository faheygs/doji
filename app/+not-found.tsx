import { Redirect, usePathname } from 'expo-router';
import { useAuthStore } from '../stores/useAuthStore';
import { FEED_TAB_HREF, normalizeHref, ROUTES } from '../lib/routes';

/**
 * Safety net: invalid hrefs (e.g. legacy `/(app)/index`) redirect instead of showing Unmatched Route.
 */
export default function NotFoundScreen() {
  const pathname = usePathname();
  const { session, profile, isLoading } = useAuthStore();

  const fixed = normalizeHref(pathname);
  if (fixed && fixed !== pathname) {
    return <Redirect href={fixed} />;
  }

  if (!isLoading && session && profile) {
    return <Redirect href={FEED_TAB_HREF} />;
  }
  if (!isLoading && session) {
    return <Redirect href={ROUTES.username} />;
  }
  return <Redirect href={ROUTES.welcome} />;
}
