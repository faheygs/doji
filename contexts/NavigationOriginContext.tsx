import React, { createContext, useContext, useMemo } from 'react';
import { useLocalSearchParams, usePathname } from 'expo-router';
import { hrefPreservingReturnTo } from '@/lib/navigationReturn';

const NavigationOriginContext = createContext<string | null>(null);

export function NavigationOriginProvider({
  origin,
  children,
}: {
  origin: string;
  children: React.ReactNode;
}) {
  return (
    <NavigationOriginContext.Provider value={origin}>
      {children}
    </NavigationOriginContext.Provider>
  );
}

/**
 * Full route to restore after any nested navigation, including its parent origin.
 * A provider may retain extra route state (for example an opened comment thread),
 * while the default automatically preserves the current screen's return chain.
 */
export function useNavigationOrigin(): string {
  const pathname = usePathname();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const providedOrigin = useContext(NavigationOriginContext);
  const routeOrigin = useMemo(
    () => String(hrefPreservingReturnTo(pathname, returnTo)),
    [pathname, returnTo],
  );
  return providedOrigin ?? routeOrigin;
}
