import React, { createContext, useContext } from 'react';
import { usePathname } from 'expo-router';

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

/** Full route to restore after nested profile/post navigation, including its parent origin. */
export function useNavigationOrigin(): string {
  const pathname = usePathname();
  return useContext(NavigationOriginContext) ?? pathname;
}
